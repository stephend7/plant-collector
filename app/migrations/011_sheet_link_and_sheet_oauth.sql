-- Migration 011 — Google Sheets sync, step B: sheet_link + sheet_row_snapshot tables
--   + allow 'sheet_oauth' as an import_batch source kind.
-- Contract: docs/sheets-sync-plan.md (design APPROVED 2026-07-07; separated Security
-- plan-review CONDITIONAL PASS, findings folded in). FULL TIER — the code this backs
-- gets its own separated Security review before deploy.
-- Safe & non-destructive: adds two tables and swaps one CHECK constraint to add a value.
-- No Google token, refresh token, or anything credential-shaped is EVER stored here —
-- spreadsheet IDs are identifiers, not credentials (access still needs the user's own
-- Google session). Wrapped in a transaction; new tables are RLS-enabled before any
-- policy exists (deny-all), so this fails CLOSED.

begin;

-- ── A. sheet_link: one row per connected spreadsheet ────────────────────────────
-- Step B uses kind='user_sheet', mode='read_only' (connect + one-time import).
-- kind='app_backup' and modes 'mirror'/'two_way' are reserved for steps C/D —
-- created now so the C/D sessions add no schema churn (per the approved contract).
create table sheet_link (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  spreadsheet_id    text not null,            -- Google file ID (identifier, not a credential)
  spreadsheet_name  text,                     -- shown to the user
  tab_id            integer,                  -- sheet/tab gid
  tab_title         text,
  kind              text not null default 'user_sheet'
                      check (kind in ('user_sheet','app_backup')),
  mode              text not null default 'read_only'
                      check (mode in ('read_only','mirror','two_way')),
  mapping           jsonb,                    -- column↔field map + header fingerprint
  consent_version   text,                     -- which disclosure text was accepted (step C)
  consent_at        timestamptz,
  last_sync_at      timestamptz,
  last_sync_status  text,
  created_at        timestamptz not null default now(),
  -- one link per user per spreadsheet per kind (a user_sheet link and an app_backup
  -- link may coexist; a double-tap can't create duplicate connection records —
  -- build-stage Security review 2026-07-07, LOW)
  unique (user_id, spreadsheet_id, kind)
);

-- ── B. sheet_row_snapshot: per-row "last agreed" values (used from step C/D) ───
-- plant_id ON DELETE SET NULL: a snapshot outliving its plant (deletion / import
-- undo) becomes an orphan marker the step-D diff surfaces for review — never a
-- silent auto-delete on either side.
create table sheet_row_snapshot (
  id             uuid primary key default gen_random_uuid(),
  sheet_link_id  uuid not null references sheet_link(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plant_id       uuid references plant(id) on delete set null,  -- null = orphaned row we still track
  row_values     jsonb not null,              -- normalized last-agreed values
  updated_at     timestamptz not null default now(),
  unique (sheet_link_id, plant_id)
);

create index on sheet_row_snapshot (sheet_link_id);

-- ── C. RLS — owner-only, same pattern as every other leaf table ────────────────
-- Both tables key on user_id = auth.uid() DIRECTLY (Security condition 14: cascade
-- ordering can never leave a row readable outside auth.uid() scoping, because no read
-- path exists except through user_id). Parent-ownership guards on the FKs (condition 9,
-- same app_owns_* shape as migration 005): a row stamped with your id is still rejected
-- if it points at someone else's sheet_link or plant.
create or replace function app_owns_sheet_link(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from sheet_link where id = p and user_id = auth.uid()) $$;

alter table sheet_link enable row level security;
create policy owner_all on sheet_link for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table sheet_row_snapshot enable row level security;
create policy owner_all on sheet_row_snapshot for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_sheet_link(sheet_link_id)
    and (plant_id is null or app_owns_plant(plant_id))
  );

-- ── D. import_batch.source_kind: add 'sheet_oauth' ─────────────────────────────
-- Migration 005's constraint allows only ('file','sheet_url','account') — it does NOT
-- already cover OAuth-read imports (Security finding, 2026-07-07). Swap, keeping the
-- existing values so nothing already stored is invalidated. ('sheet_url' is kept for
-- constraint compatibility even though the published-URL feature was CUT 2026-07-07 —
-- removing it would fail if any historical row used it; none should, but a migration
-- must not gamble.)
alter table import_batch drop constraint import_batch_source_kind_check;
alter table import_batch add constraint import_batch_source_kind_check
  check (source_kind in ('file','sheet_url','account','sheet_oauth'));

commit;
