-- ============================================================================
--  Plant Collector Database — schema & security rules (Supabase / Postgres)
--  See ../architecture.md for the plain-language model. See ../decisions.md.
--  Status: DRAFT, revised after security review 2026-06-17. NOT yet run against
--  a database. Now includes (1) parent-ownership checks on every FK write, and
--  (2) owner-only Storage policies for the photo files (bottom of file).
--
--  Security model (the important part):
--   * Every table that holds a user's data has a `user_id` column.
--   * Row-Level Security (RLS) is ON for every such table, with a policy that
--     means: you can only ever see/change rows where user_id = your own login.
--     This is enforced by the database itself — a bug in the app cannot leak
--     one user's collection to another.
--   * Sharing (show lists, sale lists) is NOT done by loosening these rules.
--     A shared list is published later (Phase 3) as a separate, stripped-down
--     copy containing only whitelisted fields. Location, quantity, and price
--     NEVER leave the owner-only tables. So this file stays strictly owner-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- REFERENCE LISTS (private per user; seedable; importable shared library later)
-- ---------------------------------------------------------------------------

-- Genus: controlled dropdown, one-tap add. Pick genus FIRST.
create table genus (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)            -- no duplicate genera per user
);

-- Species: ALWAYS scoped to a genus (Drosera rotundifolia != Pinguicula rotundifolia).
-- `name` holds the species string with its naming complexity (cultivars 'quoted',
-- hybrids ×, sp. undescribed). Care guide + descriptors hang off this row.
create table species (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  genus_id      uuid not null references genus(id) on delete cascade,
  name          text not null,
  flower_color  text,             -- Phase 2 searchable descriptor (lost-tag groundwork)
  created_at    timestamptz not null default now(),
  unique (user_id, genus_id, name) -- a species name is unique within its genus, per user
);

-- Care guide: DATED entries per species (generic first, refined over time).
-- Lookups that find nothing must say "No information available" in the UI.
create table care_guide_entry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  species_id  uuid not null references species(id) on delete cascade,
  entry_date  date not null default current_date,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Vendor / Source: full contact info (legacy Source tab).
create table vendor (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  company     text,
  address     text,
  phone       text,
  url         text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Growing location: per-user customizable list (terrariums, garage rack, ...).
create table growing_location (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Category: the curated, NAVIGABLE type-grouping people browse by
-- (Bonsai, Orchid, Carnivorous, South Africa...). A SEPARATE axis from the
-- genus hierarchy; many-to-many with plants, so a carnivorous orchid lands in
-- BOTH "Carnivorous" and "Orchid" and shows up wherever the user looks.
-- This is the PRIMARY segmentation axis, surfaced early in the UI.
create table category (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Keyword: open-ended, FREE-FORM labels for slicing the collection any way the
-- user wants ("won a ribbon", "gift from Dave", "needs repotting"). Same shape
-- as category but a DISTINCT axis and role. The structure exists now so there's
-- no painful retrofit later; the UI to actually use keywords is wired up in a
-- LATER phase (kept out of the early app to avoid clutter).
create table keyword (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- THINGS YOU OWN
-- ---------------------------------------------------------------------------

-- Plant: ONE row per acquisition (the instance). Buying another of the same
-- species = a new row; it does NOT change any existing plant. All lifecycle
-- status changes are manual. A division INCREASES quantity on this row.
create table plant (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  species_id          uuid not null references species(id) on delete restrict, -- genus comes via species
  form_descriptor     text,                       -- free-text third name slot
  vendor_id           uuid references vendor(id) on delete set null,
  growing_location_id uuid references growing_location(id) on delete set null, -- where YOU put it
  acquisition_date    date,
  acquisition_type    text                         -- HOW acquired (bought/traded/gift/division/seed)
                        check (acquisition_type in ('bought','traded','gift','division','seed','other')),
  quantity            integer not null default 1 check (quantity >= 0),
  acquisition_price   numeric(10,2),
  accession_id        text,                        -- e.g. BE-3390, tied to source
  source_url          text,                        -- link to the purchase/listing page (often has grow info)
  location_data       text,                        -- WILD origin (hobby term "location data")
  pot_label           text,                        -- fine-grained container label
  lifecycle_status    text not null default 'in_collection'
                        check (lifecycle_status in ('in_collection','dead','sold','traded','given_away')),
  offer_status        text not null default 'not_offered'
                        check (offer_status in ('not_offered','for_sale','for_trade')),
  sale_price          numeric(10,2),               -- if offered for sale
  trade_for           text,                        -- if offered for trade
  notes               text,
  cover_photo_id      uuid,                         -- FK added after photo table exists
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Photo: a dated, labeled TIMELINE per plant (progression over time — bonsai etc.).
-- Full image + thumbnail live in Supabase Storage; this row is the metadata.
create table photo (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plant_id      uuid not null references plant(id) on delete cascade,
  storage_path  text not null,
  label         text not null default 'plant'
                  check (label in ('plant','flower','plant_flower','pests','tag','other')),
  comment       text,
  photo_date    date not null default current_date,
  sort_order    integer not null default 0,
  -- journal_entry_id (a photo may belong to one entry) is added by migration 004
  created_at    timestamptz not null default now()
);

-- Now that photo exists, point a plant's cover at one of its photos.
alter table plant
  add constraint plant_cover_photo_fk
  foreign key (cover_photo_id) references photo(id) on delete set null;

-- Journal: dated text events per plant (repotting, soil mix tried, observation).
create table journal_entry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plant_id    uuid not null references plant(id) on delete cascade,
  entry_date  date not null default current_date,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Plant <-> Category: many-to-many (a plant can be in several categories).
create table plant_category (
  plant_id     uuid not null references plant(id) on delete cascade,
  category_id  uuid not null references category(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (plant_id, category_id)
);

-- Plant <-> Keyword: many-to-many (free-form labels; UI wired up in a later phase).
create table plant_keyword (
  plant_id     uuid not null references plant(id) on delete cascade,
  keyword_id   uuid not null references keyword(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (plant_id, keyword_id)
);

-- ---------------------------------------------------------------------------
-- LISTS & SHARING (built out in Phase 3; tables defined now to avoid retrofit)
-- ---------------------------------------------------------------------------

-- List: named, user-created. Sharing is a per-list toggle, OFF by default.
-- When shared, the public/link read path is a SEPARATE published snapshot
-- (Phase 3) — never a relaxation of the RLS below.
create table list (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  purpose      text not null default 'custom'
                 check (purpose in ('collection','grow','sale','trade','event','custom')),
  event_name   text,
  event_date   date,
  is_shared    boolean not null default false,        -- the share toggle (default OFF)
  share_token  text unique,                           -- unguessable; null until shared
  created_at   timestamptz not null default now()
);

create table list_plant (
  list_id   uuid not null references list(id) on delete cascade,
  plant_id  uuid not null references plant(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (list_id, plant_id)
);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY — owner-only on every table. The locked doors.
--
-- TWO layers of protection on writes:
--   (1) the row must be stamped with YOUR id          -> user_id = auth.uid()
--   (2) every parent it POINTS AT must also be yours  -> app_owns_*() below
-- Layer (2) closes cross-tenant foreign-key references: a row stamped with your
-- own id is still rejected if it points plant_id / species_id / list_id / etc.
-- at someone else's row. This also removes any "does this id exist?" probe and
-- keeps the model safe once Phase-3 sharing adds new read paths.
-- ---------------------------------------------------------------------------

-- Ownership helpers: does this parent row belong to the caller? SECURITY DEFINER
-- so the check itself isn't blocked by RLS; STABLE; pinned search_path so the
-- function body can't be hijacked.
create or replace function app_owns_genus(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from genus where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_species(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from species where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_vendor(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from vendor where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_growing_location(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from growing_location where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_category(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from category where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_keyword(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from keyword where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_plant(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from plant where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_photo(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from photo where id = p and user_id = auth.uid()) $$;
create or replace function app_owns_list(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from list where id = p and user_id = auth.uid()) $$;

-- Turn RLS on for every table that holds user data.
do $$
declare t text;
begin
  foreach t in array array[
    'genus','species','care_guide_entry','vendor','growing_location',
    'category','keyword','plant','photo','journal_entry',
    'plant_category','plant_keyword','list','list_plant'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- Leaf reference tables (no parent inside the app): owner-only is enough.
create policy owner_all on genus            for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on vendor           for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on growing_location for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on category         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on keyword          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on list             for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tables with parent references: also require every parent to be yours (on write).
create policy owner_all on species for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_genus(genus_id));

create policy owner_all on care_guide_entry for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_species(species_id));

create policy owner_all on plant for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_species(species_id)
    and (vendor_id is null or app_owns_vendor(vendor_id))
    and (growing_location_id is null or app_owns_growing_location(growing_location_id))
    and (cover_photo_id is null or app_owns_photo(cover_photo_id))
  );

create policy owner_all on photo for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_plant(plant_id)
    -- storage_path must live in the caller's own folder (keeps metadata and the
    -- actual file lock consistent; defense-in-depth from the 2026-06-17 re-review)
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

create policy owner_all on journal_entry for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_plant(plant_id));

create policy owner_all on plant_category for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_plant(plant_id) and app_owns_category(category_id));

create policy owner_all on plant_keyword for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_plant(plant_id) and app_owns_keyword(keyword_id));

create policy owner_all on list_plant for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app_owns_list(list_id) and app_owns_plant(plant_id));

-- Helpful indexes for the common lookups.
create index on species (genus_id);
create index on plant (species_id);
create index on plant (user_id);
create index on photo (plant_id);
create index on journal_entry (plant_id);
create index on care_guide_entry (species_id);
create index on list_plant (plant_id);
create index on plant_category (category_id);
create index on plant_keyword (keyword_id);

-- ---------------------------------------------------------------------------
-- STORAGE — the photo image FILES. The metadata above is useless if the bytes
-- behind photo.storage_path aren't locked down too. Bucket is PRIVATE and each
-- user can touch only their own folder (paths are "<your-user-id>/<file>.jpg",
-- matching the catalog app's convention). Run once at setup.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('photos', 'photos', false)
  on conflict (id) do update set public = false;   -- ensure it is PRIVATE

create policy "photos owner read"   on storage.objects for select to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos owner update" on storage.objects for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos owner delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
