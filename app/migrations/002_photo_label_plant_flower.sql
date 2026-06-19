-- Migration 002 — add a "Plant & Flower" photo label
-- Run once in Supabase → SQL Editor. Safe & non-destructive (widens an allowed-values list).
--
-- A single photo often shows the plant AND its flower together, so 'plant_flower'
-- joins the existing labels (plant / flower / pests / tag / other).

alter table photo drop constraint if exists photo_label_check;
alter table photo add constraint photo_label_check
  check (label in ('plant','flower','plant_flower','pests','tag','other'));
