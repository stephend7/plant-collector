-- 006: Pest / disease reference list + a pest on "pest_treated" journal events.
-- Mirrors the product feature (product table + journal_entry.product_id): a per-user
-- addable list, single pick per event for now (multi-pest is a later extension).
-- pest_id is a plain nullable FK like product_id — no app_owns guard, matching the
-- product_id precedent (a self-only opaque reference; reads are user_id-scoped, so
-- there is no cross-tenant read path).

create table if not exists pest (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)            -- a pest name is unique per user
);

alter table pest enable row level security;

-- owner-only, same shape as product / vendor / growing_location
create policy owner_all on pest for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- which pest a "pest_treated" event was treating (optional; survives pest deletion)
alter table journal_entry
  add column if not exists pest_id uuid references pest(id) on delete set null;
