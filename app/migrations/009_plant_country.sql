-- 009: Add country field to plant.
-- Stores the country of wild origin as a structured, filterable field —
-- separate from the free-text location_data (specific locality).
-- Plain nullable text column: no RLS change, no FK, no check constraint
-- (country names are open-ended; trim-normalisation is handled by the app).
-- Lite tier — no new security surface.

alter table plant add column if not exists country text;
