-- 007: per-photo "in gallery" flag.
-- Lets a JOURNAL photo (one attached to a journal entry) be kept OUT of the plant's
-- main photo gallery (the detail-page strip + "See all" page + the collection Photos
-- grid). The photo always stays visible inside its journal entry — this only controls
-- the gallery. Default true preserves current behaviour: journal photos show in the
-- gallery unless the user hides them. Plant-level photos (journal_entry_id is null)
-- are unaffected. Reads stay user_id-scoped; no policy change needed.

alter table photo
  add column if not exists in_gallery boolean not null default true;
