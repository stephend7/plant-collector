-- Migration 001 — add two new plant fields
-- Run once in Supabase → SQL Editor. Safe & non-destructive (adds optional columns only).
--
--   acquisition_type : HOW the plant was acquired (bought/traded/gift/division/seed/other)
--   source_url       : link to the vendor listing/purchase page (often carries grow info)

alter table plant
  add column acquisition_type text
    check (acquisition_type in ('bought','traded','gift','division','seed','other')),
  add column source_url text;
