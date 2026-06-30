-- 008: Multi-pest support on pest_treated journal events.
-- Replaces the single journal_entry.pest_id FK with a junction table
-- journal_entry_pest (many pests per event), matching the proven plant_category
-- pattern (same schema shape, same cross-tenant FK guards, same RLS approach).
--
-- SECURITY: Two cross-tenant FK guards on the junction:
--   app_owns_journal_entry (exists since migration 004) prevents attaching
--   another user's journal entry. app_owns_pest (new here) prevents attaching
--   another user's pest. Same SECURITY DEFINER + pinned search_path shape as
--   all other app_owns_* helpers.
--
-- The old journal_entry.pest_id column is LEFT IN PLACE (unused) for safe
-- rollback. Dropped in a later cleanup migration once multi-pest is proven.
--
-- DEPLOY ORDER: run this migration BEFORE pushing build 2026-06-30b.
-- The app reads journal_entry_pest via a separate, try/caught side query —
-- journal loading will not break if the table doesn't exist yet — but pests
-- won't save/display until this migration is applied.

begin;

-- New helper to guard the pest FK end on the junction table.
-- Mirrors app_owns_category, app_owns_plant, etc. exactly.
create or replace function app_owns_pest(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from pest where id = p and user_id = auth.uid()) $$;

-- The junction table: one row per (event, pest) pair.
create table if not exists journal_entry_pest (
  journal_entry_id  uuid not null references journal_entry(id) on delete cascade,
  pest_id           uuid not null references pest(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  primary key (journal_entry_id, pest_id)
);

-- Index on pest_id so deleting a pest cascades efficiently.
create index if not exists jep_pest_idx on journal_entry_pest (pest_id);

alter table journal_entry_pest enable row level security;

-- Owner-only with cross-tenant FK guards on both ends.
create policy owner_all on journal_entry_pest for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_journal_entry(journal_entry_id)
    and app_owns_pest(pest_id)
  );

-- Backfill: migrate all existing single-pest events into the junction.
-- user_id is carried explicitly from the journal_entry row because this SQL
-- runs as the postgres superuser (auth.uid() = null in the SQL editor).
-- on conflict do nothing makes this re-runnable safely.
insert into journal_entry_pest (journal_entry_id, pest_id, user_id)
  select je.id, je.pest_id, je.user_id
  from journal_entry je
  where je.pest_id is not null
on conflict do nothing;

-- Drop the now-redundant single-pest column. The junction table is the
-- sole source of truth going forward. Safe to drop because:
--   (a) data has just been backfilled into journal_entry_pest above, and
--   (b) the app no longer reads or writes this column as of build 2026-06-30b.
alter table journal_entry drop column if exists pest_id;

commit;
