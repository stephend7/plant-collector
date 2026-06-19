-- Migration 003 — the Event Log spine + species care fields
-- STATUS: PENDING SIGN-OFF. Do NOT run until the design is approved and the
-- RLS change has had its adversarial security check (full-tier, per project method).
-- Safe & non-destructive (adds optional columns; widens the journal into an event log).
-- Wrapped in a transaction so it's all-or-nothing; DDL is transactional in Postgres, and
-- while the policy is briefly dropped the table stays RLS-enabled = deny-all (fails CLOSED).

begin;

-- ── A. Evolve journal_entry into the EVENT LOG ──────────────────────────────
-- Keeps the table name; adds a type + optional slots so one table powers the
-- timeline, phenology, measurements, death history, and breeding records.
alter table journal_entry
  add column event_type text not null default 'note'
    check (event_type in (
      'note','acquired','flowered','fruited','divided','repotted','fed',
      'pest_treated','dormant','woke','measured','died','sold','traded',
      'given_away','crossed'
    )),
  add column photo_id         uuid references photo(id) on delete set null,   -- a photo that IS the event
  add column related_plant_id uuid references plant(id) on delete set null,   -- the OTHER parent in a cross
  add column measure_label    text,        -- e.g. "pitcher height" (so measurements chart by label)
  add column measure_value    numeric,     -- the number
  add column measure_unit     text,        -- e.g. "cm"
  add column cause            text;        -- optional death cause (UI offers an extensible pick-list)

-- body (the free-text note) is optional now — most events need no prose.
alter table journal_entry alter column body drop not null;

-- ── B. Extend RLS so the new FK columns can't point at another user's rows ──
-- (Same cross-tenant-injection guard we applied to plant/photo in the 2026-06-17 review.)
drop policy owner_all on journal_entry;
create policy owner_all on journal_entry for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_owns_plant(plant_id)
    and (photo_id is null or app_owns_photo(photo_id))
    and (related_plant_id is null or app_owns_plant(related_plant_id))
  );

-- ── C. Structured care fields on species (quick dropdowns; reminders compute on these) ──
-- Plain text on purpose: the UI offers the choices, so we can tweak options later
-- WITHOUT another migration. Empty = "No information available" in the UI.
alter table species
  add column care_dormancy    text,   -- needs winter cold? which months
  add column care_water       text,   -- rain/distilled vs tap-ok
  add column care_feeding     text,   -- no / occasional / regular
  add column care_light       text,   -- full sun / bright / shade
  add column care_photoperiod text,   -- day-length sensitivity (e.g. Nepenthes)
  add column care_humidity    text;   -- low / moderate / high

commit;
