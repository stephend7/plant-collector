-- 004_multi_photo_journal_entries.sql
-- Let a single journal entry own MANY photos (e.g. a repot: before / after / roots).
-- A photo may optionally belong to a journal_entry; an entry's photos are the photos
-- whose journal_entry_id points at it. Photos with a null journal_entry_id are
-- plant-level (the existing behaviour). Mirrors the proven app_owns_*() RLS pattern.
--
-- SECURITY (full-tier, isolation focus): the new FK is guarded on write exactly like the
-- guards added in migration 003 — a photo's journal_entry_id (when set) must reference one
-- of the CALLER's own entries (app_owns_journal_entry, SECURITY DEFINER + pinned
-- search_path). Reads stay user_id-scoped, so A can never see or attach to B's data. The
-- policy swap runs inside a transaction (atomic; RLS stays enabled = deny-all mid-swap).
-- on delete set null = deleting an entry leaves its photos as plant-level photos (no loss).

begin;

alter table photo
  add column if not exists journal_entry_id uuid references journal_entry(id) on delete set null;

create index if not exists photo_journal_entry_idx on photo (journal_entry_id);

create or replace function app_owns_journal_entry(p uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from journal_entry where id = p and user_id = auth.uid()) $$;

drop policy if exists owner_all on photo;
create policy owner_all on photo for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_plant(plant_id)
    and (journal_entry_id is null or app_owns_journal_entry(journal_entry_id))
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

-- Backfill: existing single-photo events keep their photo, now linked the new way.
update photo p
   set journal_entry_id = je.id
  from journal_entry je
 where je.photo_id = p.id
   and p.journal_entry_id is null;

commit;
