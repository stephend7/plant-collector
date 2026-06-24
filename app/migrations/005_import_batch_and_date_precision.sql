-- Migration 005 — Import batch (undo safety net) + acquisition_date precision
-- STATUS: PENDING SIGN-OFF. Full-tier (untrusted-file import). Do NOT run until the
-- separated Security pass has reviewed the import path this table backs.
-- Safe & non-destructive: adds one table + two optional columns; widens no existing rule
-- except to EXTEND the plant write-policy with one more owner-check (fails closed).
-- Wrapped in a transaction (DDL is transactional in Postgres; while the plant policy is
-- briefly dropped the table stays RLS-enabled = deny-all, so it fails CLOSED).

begin;

-- ── A. Import batch: one row per import run, so a botched import is reversible ──
-- Every plant created in a run points back here (plant.import_batch_id). "Undo this
-- import" deletes that batch's PLANTS only (reference rows are kept — they may already
-- be used by hand-entered plants; plant.species_id ON DELETE RESTRICT guards that).
create table import_batch (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at   timestamptz not null default now(),    -- the moment Import was clicked
  source_name  text,                                  -- filename / sheet name shown to the user
  source_kind  text not null default 'file'
                 check (source_kind in ('file','sheet_url','account')),
  plant_count  integer not null default 0,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ── B. Link plants to their batch + record date precision ──────────────────────
-- import_batch_id: NULL for hand-entered plants (a free "imported vs typed" signal).
--   ON DELETE SET NULL so deleting a batch RECORD never silently cascades to plants;
--   the "Undo import" action deletes plant rows explicitly, with a counted confirm.
-- acquisition_date_precision: a month-only sheet value ("August 2020") is stored as the
--   1st of the month; this marker ('day'/'month'/'year') keeps the UI honest and stops
--   any future date-aware feature from assuming a day we don't actually know.
alter table plant
  add column import_batch_id uuid references import_batch(id) on delete set null,
  add column acquisition_date_precision text
    check (acquisition_date_precision in ('day','month','year'));

create index on plant (import_batch_id);

-- ── C. RLS — owner-only on import_batch; extend plant's parent-ownership check ──
create or replace function app_owns_import_batch(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from import_batch where id = p and user_id = auth.uid()) $$;

alter table import_batch enable row level security;
create policy owner_all on import_batch for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Re-create plant's policy with the extra check: a stamped-with-your-id plant is still
-- rejected if its import_batch_id points at someone else's batch (cross-tenant guard,
-- same shape as the existing app_owns_* checks).
drop policy owner_all on plant;
create policy owner_all on plant for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_species(species_id)
    and (vendor_id is null or app_owns_vendor(vendor_id))
    and (growing_location_id is null or app_owns_growing_location(growing_location_id))
    and (cover_photo_id is null or app_owns_photo(cover_photo_id))
    and (import_batch_id is null or app_owns_import_batch(import_batch_id))
  );

commit;
