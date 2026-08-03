# Database migrations

A migration is a small "also do this to the database" instruction we run **after** the
original `schema.sql` was first built. Each one is a numbered `.sql` file in this folder.

## Why this exists
`schema.sql` is the recipe that built the database the very first day. Editing that file
afterward does **not** change the live database — the live database only changes when SQL is
actually run against it inside the Supabase dashboard. So whenever we add or change a field,
we drop a numbered file here and run it once in Supabase. This folder is the durable record
of every change made to the live database, in order.

## How to apply one
1. Open Supabase → **SQL Editor** → New query.
2. Open the lowest-numbered file below that is still **NOT APPLIED**.
3. Paste its contents, run it. You should see "Success. No rows returned."
4. Come back here and mark it **APPLIED** with the date.

Always run them in number order, and only once each. They're safe and non-destructive
(they add optional columns; nothing existing is touched).

## Log

| #   | File                                      | What it does                                   | Status |
|-----|-------------------------------------------|------------------------------------------------|--------|
| 000 | `../schema.sql` (baseline)                | Built all tables, security, storage bucket     | ✅ APPLIED 2026-06-17 |
| 001 | `001_acquisition_type_and_source_url.sql` | Adds `acquisition_type` + `source_url` to plant | ✅ APPLIED 2026-06-18 |
| 002 | `002_photo_label_plant_flower.sql`        | Adds `plant_flower` to allowed photo labels     | ✅ APPLIED 2026-06-18 |
| 003 | `003_event_log_and_care_fields.sql`       | Event-log columns on journal + species care fields | ✅ APPLIED 2026-06-18 |
| 004 | `004_multi_photo_journal_entries.sql`     | `photo.journal_entry_id` so an entry can hold many photos (+ RLS guard) | ✅ APPLIED 2026-06-21 |
| 005 | `005_import_batch_and_date_precision.sql` | Import batches (undo) + partial-date precision | ✅ APPLIED 2026-06-23 |
| 006 | `006_pest_reference_and_journal_pest.sql` | `pest` reference table + pest on `pest_treated` events | ✅ APPLIED 2026-06-24 |
| 007 | `007_photo_in_gallery.sql`                | `photo.in_gallery` — keep journal-only photos out of the gallery | ✅ APPLIED 2026-06-26 |
| 008 | `008_multi_pest_per_event.sql`            | Multi-pest per event: `journal_entry_pest` junction replaces single FK | ✅ APPLIED 2026-06-30 |
| 009 | `009_plant_country.sql`                   | `plant.country` (wild-origin country) | ✅ APPLIED 2026-06-30 |
| 010 | `010_inventory_last_seen.sql`             | `plant.last_seen_at` + `last_seen_count` (Inventory mode) | ✅ APPLIED 2026-07-05 |
| 011 | `011_sheet_link_and_sheet_oauth.sql`      | `sheet_link` table for the Google Sheets connection (+ RLS) | ✅ APPLIED 2026-07-07 |

> Ledger repaired 2026-08-02 (stabilization plan, Phase A3): rows 005–011 above were
> applied when their features shipped (dates evidenced by the matching `decisions.md`
> entries) but this table was never updated past 004 — which made the paper trail lie.
> **House rule going forward: applying a migration and updating this table are ONE step.**
> Phase D1 of `docs/stabilization-plan.md` independently verifies this ledger by
> rebuilding a database from these files alone and comparing schema manifests.
