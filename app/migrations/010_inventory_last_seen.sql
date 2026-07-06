-- 010: Add last_seen_at / last_seen_count to plant, for lightweight rolling inventory mode.
-- Tapping "seen" on a plant stamps last_seen_at (and optionally last_seen_count if the
-- count was adjusted). No sessions, no staleness alerts — the app never auto-flags a gap;
-- the user consults a least-recently-seen sort whenever they choose to.
-- Plain nullable columns: no FK, no check constraint, no RLS change (existing owner-only
-- policies on `plant` already cover all its columns). Lite tier — no new security surface.

alter table plant add column if not exists last_seen_at timestamptz;
alter table plant add column if not exists last_seen_count integer;
