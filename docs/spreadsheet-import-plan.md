---
type: plan
title: Spreadsheet Import — Architect Contract & Conditions for Builder
description: Full-tier design contract for bulk-importing a collection from .xlsx/.csv (Google Sheets / Excel) with a field-mapping UI and a review gate. The security/correctness invariants the separated Security pass reviews against.
updated: 2026-06-23
status: DRAFT — for discussion with Stephen, not yet built
---

# Spreadsheet Import — Architect Contract

> **Tier: FULL.** Trigger: **untrusted-file parsing** (a new ingest path with no analog
> shipped). Per CLAUDE.md, a **real separate Security agent** reviews the parse/import
> path against the *Conditions for Builder* below — not an inline review.
> Owner is non-technical: the UI must be forgiving and never destructive.

## Goal (one sentence)

Let the user pick an Excel/Sheets file, **map its columns** to our fields once,
**preview** what will be created, and import — turning rows into `plant` records
(creating the `genus` / `species` / `vendor` rows they reference) **only after the user
confirms**, with nothing written until then.

## Why field-mapping is non-negotiable (ground truth from the 3 real files)

- **Stephen's sheets SPLIT** genus and species into separate columns (`Genus`, `Species`).
- **The friend's sheet COMBINES** them into one `Species Name` cell, sometimes with a
  cultivar and an accession code: `Nepenthes ampullaria 'Lime Twist', BE-3390`.
- Column names differ across every file (`Date_Purchased` vs `Date ` vs `Date Obtained - Type`;
  `Source` vs `Origin`; `Cost` vs price-in-name; `Notes`/`Description` vs `Growing Notes`).
- `Sheet11` (133 species) and the `Source` tab are **reference-list seeds**, not plants.

So the importer must support **two name modes** and **per-column mapping**, chosen by the user.

## Scope — IN for this build

1. **File pick** (`.xlsx`, `.xls`, `.csv`) from Excel or Google Sheets ("download as").
2. **Sheet/tab picker** (workbooks have many tabs; user picks which one to import).
3. **Field-mapping UI**: show detected columns + first rows; let the user map each of our
   target fields to a source column (or "ignore"). Two **name modes**:
   - *Combined* → one column, run through the existing botanical parser ([index.html:1373](../app/index.html:1373)).
   - *Split* → separate Genus + Species columns.
4. **Target fields (v1):** genus, species, form/descriptor, vendor (by name), acquisition_date,
   acquisition_price, accession_id, source_url, location_data, notes, lifecycle_status, quantity.
5. **Review/preview gate**: a table of parsed rows showing *exactly* what will be created
   (new genera, new species, new vendors, N plants), per-row validation flags, and a count.
   **Nothing is written to the DB until the user clicks Import on this screen.**
6. **Reconcile / de-dupe — REFERENCE rows only**: reuse-or-create genus/species/vendor
   case-insensitively, trimming whitespace (the `"Pinguicula"` vs `"Pinguicula "` rot). Reuse the
   look-up-or-create logic already at [index.html:1689](../app/index.html:1689).
   **PLANT rows are NEVER de-duped or merged.** A Plant is a lineage/provenance, not a tally of
   look-alikes — two `Pinguicula cyclosecta` rows (one from Rainbow, one from CalCarn) stay
   separate plants even if identical, and quantity counts propagation *within* a lineage. So the
   importer must never auto-collapse rows sharing genus+species; "135 species, 149 plants" in the
   preview is correct, not a merge prompt. (See architecture.md "A Plant is a lineage", 2026-06-23.)
7. **Reference-list-only import mode**: import `Sheet11` → species list, `Source` → vendors,
   without creating plants. (Same mapping UI, "rows are reference entries not plants".)
8. **Result report**: created counts, skipped rows + reasons, and a list of warnings.
9. **Import batch + undo (safety net)**: every run records an `import_batch` (started_at +
   source filename); every plant created points back to it. The user can review a batch, delete
   individual rows, or **undo the whole batch** (delete its plants, with a counted confirm).

## Scope — OUT (explicitly deferred)

- Photos/images from the legacy `Pictures`/`Images` tabs (legacy data is REFERENCE/SEED per
  [[legacy-data-findings]]; no forensic migration). Photos stay manual for now.
- Parsing the friend's dated-journal-in-one-cell into multiple journal events (import the whole
  cell into `notes` for v1; structured journal split is a later nicety).
- "Sync" in the two-way / re-import-and-merge sense. **v1 is one-way import** (see Open Q1).
- Google Sheets *live API* connection (OAuth). v1 is file upload only; live sync is later.

> **Stephen's steer (2026-06-23): he wants Google Sheets *connection / sync*, not only upload.**
> Architect resolution — one feature family, shared back half. The mapping + preview + reconcile
> core is IDENTICAL regardless of source, so build it once and feed it from three front-ends, in order:
> 1. **File upload** (this v1) — depends on no external API; unblocks getting the collection in now.
> 2. **Published-sheet URL read** — paste a link to a published/link-viewable sheet; fetch all tabs
>    as CSV (gviz/CSV export, per-tab `gid`); re-pull to refresh. Read-only, one-way (sheet→app).
>    Gives ~80% of the "sync feel" with no OAuth and minimal new risk. *Likely the next increment.*
> 3. **Private-account connection (OAuth)** — read private sheets without publishing; its own
>    full-tier feature (Google Cloud project, consent screen, token handling, maintenance).
> 4. **True two-way sync** — biggest + riskiest (source-of-truth / conflict resolution = the
>    data-corruption risk we most guard against). A designed phase of its own, not bolted onto import.
> Multiple tabs are first-class in every tier (the sheet/tab picker). Nothing built for upload is
> wasted when connection arrives — that is the reason to build the shared core first.
- Auto-mapping by AI. v1 offers sensible default guesses by header name; user confirms.

## Data flow

```
[Import screen]
  pick file ──> parse in a WEB WORKER (isolated; no DOM, no Supabase, no session token)
      worker: SheetJS read → for chosen sheet → array-of-arrays of INERT strings
              (caps enforced: file size, sheet count, rows, cols, cell length)
  ──> main thread: show columns + sample rows
  ──> user maps fields + picks name mode  ──> PREVIEW (parse + reconcile in memory only)
  ──> user clicks Import
  ──> batched writes via the EXISTING RLS-scoped supabase client:
        ensure genus → ensure species(genus) → ensure vendor → insert plant rows
  ──> result report (created / skipped / warnings)
```

## Files (anticipated)

- `app/index.html` — new Alpine sub-view + state (`import*`), the mapping/preview/result UI.
- `app/lib/xlsx.min.js` — **vendored** parser (no CDN; we self-host everything — see Open Q2).
- `app/lib/import-worker.js` — the Web Worker that does the actual parsing in isolation.
- `decisions.md` — dated decision entry (parser choice + the security posture below).
- `app/migrations/005_import_batch.sql` — the new table below (Security reviews it).

## Import batch + undo (the rollback safety net)

Stephen's ask (2026-06-23): stamp every imported plant so a botched import can be reviewed and
removed as a group, or row-by-row. Implemented as a first-class **batch record** (gives the group
a name/date/source to show and act on), not just a loose timestamp column.

```sql
-- migration 005 (DRAFT — Security to review with the rest of the import path)
create table import_batch (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at   timestamptz not null default now(),   -- the moment Import was clicked
  source_name  text,                                  -- filename / sheet name shown to the user
  source_kind  text default 'file'                    -- 'file' now; 'sheet_url' etc. later
                 check (source_kind in ('file','sheet_url','account')),
  plant_count  integer not null default 0,
  notes        text,
  created_at   timestamptz not null default now()
);
alter table plant
  add column import_batch_id uuid references import_batch(id) on delete set null;
create index on plant (import_batch_id);
-- RLS: owner_all on import_batch (same as other leaf tables); plant's write policy gains
--   (import_batch_id is null or app_owns_import_batch(import_batch_id))
-- plus an app_owns_import_batch() helper, mirroring the existing app_owns_* functions.
```

**Semantics (deliberate, so undo can't cause a second disaster):**
- **Undo deletes the batch's *plants* only — never the reference rows** (genus/species/vendor)
  it created. Those may already be used by hand-entered plants; the schema's
  `plant.species_id … on delete restrict` already guards this. Reference rows are harmless to keep.
- **`on delete set null`, not cascade.** Deleting the batch *record* never silently nukes plants.
  The "Undo this import" action explicitly deletes the plant rows with a **counted confirm**
  ("This will delete 149 plants."), then removes the batch.
- Hand-entered plants have `import_batch_id = null` → "imported" vs "typed by me" stays
  distinguishable (a free provenance signal).

## Design principles that emerged (2026-06-23, with Stephen)

1. **Errors block a row; warnings never do.** A *blocking error* = the row can't be written
   (missing genus while species is required; a value that violates a `check`). A *warning* =
   we made a guess (fuzzy/partial date, price scraped from a name, low-confidence name split).
   Warnings are accept-in-bulk; we never turn a 500-row import into 500 mandatory fixes.
2. **Deterministic first; AI is optional assist only.** The parser + editable preview already
   *is* "guess and confirm." Use AI only for genuinely mangled cases, and **prefer AI on
   DISTINCT-VALUE sets** (status vocab, vendor clusters — bounded, cheap, ~10s of calls) over
   **per-row** calls (thousands = slow, costly, and ships the whole collection to the model).
   AI never writes a field silently — it pre-fills a choice the user confirms.
3. **Nothing silent.** Every guess, skip, and transformation is shown in the preview before commit
   (verification-as-a-gate; the cardinal sin is losing/altering data without showing it).

## Import traps the preview must catch (severity-tagged)

Grounded in the THREE real files. **[BLOCK]** = stops that row; **[WARN]** = shown, accept-in-bulk;
**[SILENT-OK]** = safe to normalize quietly (still summarized in the report).

| # | Trap | Real example | Sev | Handling |
|---|------|--------------|-----|----------|
| T1 | Partial / mixed-form dates | `August 2020`; `8/19/20`; `2019-02-16 00:00:00` | WARN | store 1st-of-month + precision marker; never guess ambiguous M/D silently |
| T2 | Free-text source → junk vendors | Origin `"SSCPE grand prize winner raffle…"`; `"None"` | WARN | allow map→notes instead of vendor; skip empty/"None"; trim+case match |
| T3 | Header row isn't row 1 / non-table tab | Gianes `SoldTrade`, `Interested in` | BLOCK→ask | user picks header row / skips tab; detect "not a table" |
| T4 | In-cell newlines / commas / quotes | `"hamata AW clone 1\n(Gunung…)"`; `"clipeata, Wistuba…"` | SILENT-OK | real parser only (never hand-split on comma); test a CSV export of *her* file |
| T5 | Excel mangled numbers | Zip `95139.0`, Phone `4088027430.0`, Key `1.0` | SILENT-OK | read identifier-ish cols as TEXT verbatim; keep leading zeros |
| T6 | Combined name mis-split | `Nepenthes ampullaria 'Lime Twist', BE-3390` | WARN | show genus│species│form│accession split; editable before commit |
| T7 | Hybrid cross strings | `burkei x hamata`; `A×B` vs `B×A` | WARN | store whole cross as species; flag reversed-cross dup risk |
| T8 | Capitalization | `Admirabilis` (epithet) vs `'Lime Twist'` (cultivar) | SILENT-OK | trim + smart-quote normalize ONLY; never auto-case (would wreck cultivars) |
| T9 | Accession codes are private formats | `S-06062026-al-01` (date+genus+sp+division suffix) | SILENT-OK | **store verbatim; never parse, never mine its embedded date into the date col** |
| T10 | `$` buried in a name | SoldTrade `"N. maxima x jacquelineae $70"` | WARN | if price empty, scrape `$NN`→price as a guess; bail on ranges/"shipped" |
| T11 | Wishlist rows ≠ owned plants | `Want` column; `Interested in` tab | WARN→skip | v1 flags + SKIPS ("skipped N wishlist rows — coming later") |
| T12 | Free-text status → enum/condition | `dormant`, `quarantine`, `died` | BLOCK→map | status-mapping step (distinct values → lifecycle│tag│notes); keep original in notes |
| T13 | `Type` = Plant/Seed | `Seed` rows in 02-25 | SILENT-OK | `Seed`→`acquisition_type='seed'` (existing value); no schema change |
| T14 | Genus-less / common-name-only row | non-pro sheets; common names | BLOCK→ask (v1) | flag+ask now; **common_name + nullable species = fast-follow (006)** |
| T15 | In-run duplicate reference creation | same new species on 5 rows | BLOCK (constraint) | dedupe in-memory by `genus│name` map within the batch, not per-row re-query |
| T16 | Volume → thousands of round-trips | a pro's 8k-row sheet | — | batch inserts; enforce caps; progress UI; guard double-click |
| T17 | Partial failure mid-import | row 4000 errors / tab closed | — | batch+undo recovery; reference reuse is idempotent |
| T18 | CSV/formula injection, zip bomb, proto/XSS | crafted workbook | BLOCK | covered in Security model below |

## Prerequisites — what must exist BEFORE import (sequenced)

**Blocks importing STEPHEN'S OWN data (do first):**
- **Status-mapping step** — minimal version needs **no schema change**: map known words → existing
  `lifecycle_status` enum, unknowns → keep in `notes` + default `in_collection`. (Richer option: a
  per-user status lookup table — deferred decision; keep the alive/dead invariant for now.)
- **`import_batch` table (migration 005)** — already specified above.

**Deferrable without data loss (recommend NOT tonight):**
- **Wishlist rows** → v1 flags + skips; real non-owned holding state is a lists-phase feature.
- **`common_name` + nullable `plant.species_id` (migration 006)** → fast-follow; needed before
  *other people's* messy sheets, not Stephen's (his 3 files all have genus+species).
- **AI assist passes** (vendor cleanup, hard-row splits) → enhancement.
- **Stable sync-ID column** → DESIGN now (a per-plant id written INTO the sheet as a column;
  re-import matches on it — row number is unsafe, sheets get re-sorted), WIRE UP with the
  published-sheet / sync increment.

**Decisions LOCKED (Stephen, 2026-06-23):**
- ✅ **Parser = SheetJS in a Web Worker** — upload the file directly (no CSV-export step).
- ✅ **Partial dates = 1st-of-month + a `acquisition_date_precision` marker** (`day`/`month`/`year`,
  a small new column on `plant`). Stored date sorts correctly; the marker stops any future
  date-aware feature (reminders/analytics) from assuming a day we don't know, and keeps the UI
  honest ("Aug 2020", not "Aug 1"). Goes in the pre-import model migration.
- ✅ **Accession codes stored verbatim** — never parsed, split, or date-mined.

## Security model — the Conditions for Builder (what Security reviews against)

The threat: a **malicious or malformed workbook** the user was given (the friend's file, a
vendor's export, a downloaded sheet). The browser must not be harmed, and the user's data
must not be corrupted or leaked.

1. **Parse in a Web Worker, never the main thread.** The worker has no DOM, no `window.sb`,
   no session token, no Storage access. A parser exploit there cannot read the user's auth
   token or touch the database. The worker returns only plain string/number arrays.
2. **Hard caps, enforced before and during parse** (reject, don't truncate-silently — tell
   the user): max file size (e.g. 15 MB), max sheets read, max rows (e.g. 10k), max columns,
   max cell length (e.g. 8k chars). This is the **zip-bomb / decompression-bomb** and
   memory-exhaustion defense for `.xlsx` (which is zipped XML).
3. **Values only, formulas inert.** Read computed/raw values; **never evaluate formulas**.
   A cell beginning `=`, `+`, `-`, `@` is treated as literal text and, on any future CSV/text
   export, prefixed to neutralize **CSV-injection** (formula injection) — it must never be
   executed here or downstream.
4. **Prototype-pollution safe.** Build row objects with `Object.create(null)`; reject/skip
   any key named `__proto__`, `constructor`, `prototype`. Header names are data, not keys
   into live objects.
5. **All cell text is inert in the DOM.** Render preview via Alpine `x-text` / bound values
   only — **never** `innerHTML`/`x-html` with cell content (no stored-XSS via a crafted cell).
6. **No write before confirm.** Parsing and reconciliation are pure/in-memory. The only DB
   writes happen after the explicit Import click, through the **existing RLS policies**
   (every insert is still `user_id = auth.uid()` + parent-ownership checked by schema.sql).
   Import introduces **no new RLS surface** — it's the same authenticated insert path the
   add-plant form uses.
7. **Partial-failure safety.** Writes are batched and **idempotent on reference rows**
   (reuse-or-create by unique name), so a re-run after a mid-import error does not duplicate
   genera/species/vendors. Plant rows: see Open Q1 (re-import dedup policy).
8. **Honest reporting.** The result report states real counts and every skipped row with a
   reason (verification-as-a-gate; no "looks done" without the numbers).

## Conditions for Builder (acceptance checklist)

- [ ] Parsing happens in `import-worker.js`; the worker file references no Supabase/auth symbol.
- [ ] All five caps (size/sheets/rows/cols/cell-len) are enforced with a user-visible message.
- [ ] A workbook with a `=cmd` / `__proto__` / 50k-row / deeply-nested cell is handled without
      crashing the tab or polluting objects (Security supplies adversarial fixtures).
- [ ] Preview screen shows new-genus / new-species / new-vendor / plant counts BEFORE any write;
      cancelling writes nothing (verified by row counts in the DB).
- [ ] Combined-name mode reproduces the parser's handling of `Nepenthes … 'Lime Twist', BE-3390`
      (cultivar → species form; trailing code → accession or notes, decided in Open Q3).
- [ ] Split mode imports `CP Database 02-25 → Plant` with genus/species mapped correctly.
- [ ] Whitespace/case de-dupe: importing `Sheet11` twice yields one set of species, no dupes.
- [ ] Result report counts reconcile with a real `select count(*)` before/after (empirical gate).
- [ ] Every imported plant carries the run's `import_batch_id`; hand-entered plants stay `null`.
- [ ] "Undo this import" deletes exactly that batch's plants (counted confirm), leaves
      genus/species/vendor intact, and the plant count returns to its pre-import value (verified
      by real `select count(*)`). Deleting the batch record alone never deletes plants.
- [ ] Verified in a REAL browser with the `test@test.com` account on all three real files.

## Build & review status (2026-06-23)

**Built** (`app/lib/import-worker.js`, `app/lib/xlsx.full.min.js` = SheetJS 0.20.3 pinned,
import UI + logic in `app/index.html`, migration `005_import_batch_and_date_precision.sql`,
build marker → `2026-06-23r`).

**Separated Security pass DONE** (real second agent, reviewer ≠ author). Verdict: **SHIP-WITH-FIXES**.
Confirmed sound: Worker isolation (no Supabase/token/DOM), no-write-before-confirm (`buildImportPreview`
has zero `sb.` calls), prototype safety (Maps + array-of-rules, never untrusted text as an object key),
XSS (`x-text` only), migration 005 RLS (re-created `plant` policy preserves all guards + adds
import_batch; fails closed; `app_owns_import_batch` hardened), reference dedup stricter than the DB
unique. **Fixes applied + re-verified in JavaScriptCore:**
- **CSV/formula injection on export** (the one cross-trust-boundary bug — imported data flowing back
  out through `exportCsv`): `esc` now prefixes `'` to cells starting `= + - @ \t \r`. 9/9 payloads defanged.
- **Caps before OOM**: the chosen sheet is now materialized through a **clamped range** so a hostile
  `!ref` can't OOM `sheet_to_json`; worker doc made honest that the residual zip-decompression bomb is
  *contained by Worker isolation*, not prevented.
- **Honest undo count**: `plant_count` updated per-chunk so a partial-failure undo confirm isn't "0".

**Verification — done vs still owed (honest):**
- ✅ Deterministic parser core executed against the REAL sheet strings (JavaScriptCore, 33/33 true
  passes): combined/split name split, accession verbatim (no date-mining), partial-date precision,
  price scrape, status→enum, header auto-map for both shapes, whitespace/case/quote dedup.
- ✅ Export formula-injection fix executed against 9 payloads.
- ✅ **Deployed (build `2026-06-23r`) and the PARSE→MAP→PREVIEW pipeline verified LIVE on the
  deployed app** (Chrome, signed in as `test@test.com`, 2026-06-23): the real Web Worker + SheetJS
  parsed fed files; **combined mode** peeled `BE-3390`→accession, `August 2020`→2020-08-01 (month),
  `Carnivero`→vendor; **split mode** skipped the wishlist row, kept `agnata 'True Blue'` verbatim,
  mapped `alive→in_collection`/`dead→dead`/`quarantine→kept in notes`, scraped price. Preview makes
  zero DB calls (re-confirmed). This is the worker + full pipeline the sandbox couldn't run.
- ✅ **DB import + undo VERIFIED LIVE (2026-06-23, after Stephen applied migration 005), counts
  reconcile with real numbers:** on `test@test.com`, plants 1 → **4** (imported 3) → **1** (undo).
  Import created 3 plants under a batch with **no new reference rows** (reused existing
  `Drosera capensis`/vendor) — and **3 identical rows became 3 separate plant instances** (the
  never-merge rule) while species count held at 7. Undo removed exactly the batch's 3 plants,
  left genus/species/vendor untouched, deleted the batch record, account back to baseline (clean).
- ✅ **Real `.xlsx` zip path + multi-tab picker VERIFIED LIVE:** a generated 2-sheet xlsx binary
  read by the worker → tab picker listed both tabs w/ dims → combined-name parse on a genuine
  **in-cell** comma peeled `BE-3390`→accession (the real friend scenario, no CSV artifact).
- ✅ **"View a specific import's plants" drill-down added + verified live (2026-06-24, build `s`):**
  tap an import in "Previous imports" → batch view lists exactly that import's plants
  (`import_batch_id` filter), with per-import Undo; tap a plant to open it. Closes the "see what
  was imported before undoing" gap. Lite tier (read-only). Verified: import 2 → view 2 → undo 1.
- ⬜ Remaining (low): a pass on Stephen's iPhone (Safari/WebKit) — Chrome is Blink; and running his
  three actual files when he's ready to load his real collection.

## Open questions for Stephen (decide before Builder starts)

1. **Re-import behavior.** If you import the same file twice, should it (a) create duplicate
   plant rows, (b) skip rows that look identical, or (c) always create (plants are instances —
   buying the same species twice is legitimately two rows)? *Architect leans (c) for plants but
   (b)/reuse for genus/species/vendor.* This is the closest thing to "sync" in v1.
2. **Parser library** (the security crux). Self-hosted **SheetJS community** reads `.xlsx`
   *and* `.csv` in one lib (best UX for you — just upload the file), but it's large and has a
   CVE history, which is exactly why we sandbox it in a Worker with hard caps. The safer-but-
   clunkier alternative is **CSV-only** (tiny parser, you "Download as CSV" first). *Architect
   recommends SheetJS-in-a-Worker* so your workflow stays "upload the .xlsx you already have."
3. **The friend's combined `, BE-3390` code** — import as `accession_id`, or leave in `notes`?
4. **Lifecycle from tabs.** The friend's `Removed`/`SoldTrade` tabs encode status. Do we add a
   per-import "set all these rows' status to ___" control, or import everything as
   `in_collection` and let you fix later? *Architect leans: a per-import default status picker.*

## User story (Stephen's words, 2026-06-23)

**The world we're entering.** Plant collectors keep their lists in spreadsheets and get
*attached* to them — they can scroll fast and know where everything is. The limits bug them,
but they live with it because nothing better exists. The shapes vary: simple = Genus, species,
descriptors (often one field, "white flower" / "tall"), location data (wild origin), notes.
Richer = + accession ID, price, who they got it from, and primitive journaling (journal entries
crammed in a cell, like Giane's). Many keep **multiple lists** — collection, trade, for-sale
(Facebook/eBay), wishlist — but only heavy traders bother making the trade/sale ones.

**The #1 unmet need.** The biggest complaint from spreadsheet users: *you can't keep a photo
journal connected to the plant.* That's the wedge — the reason to leave a beloved spreadsheet.

**The deepest fear.** "The app disappears and I lose a decade of information." That's why Stephen
used AppSheet (Google-Sheets-backed → portable to any database). **Sync exists to protect that
investment**, not for convenience.

**The story.**
> I've kept my collection in spreadsheets for years — `CP Database 02-25` is the clean one, but
> my friend Giane keeps hers completely differently, genus and species jammed into one cell with
> the clone code. I want both in the app, and there's no way I'm hand-typing 149 rows. I upload my
> file, the app shows me my columns and asks which is the genus, which is the species, which is the
> vendor — I set it once. Then, before it touches anything, it shows me *exactly* what it's about
> to do: "9 genera, 135 species, 4 vendors, 149 plants — 3 rows look off, here's why." I fix the 3,
> hit go, and my collection is suddenly *there* — grouped by genus the way I think about it, vendors
> filled in. When I make a change in the app, I want it to show up in the spreadsheet eventually. I
> don't want to lose anything. Different people define "don't lose anything" differently, so we may
> need two ways out: one that fits the shape they designed, one that exports to multiple tabs a
> relational database could be rebuilt from. I have no idea how we'd handle the pictures.

## Multiple lists → tags, not parallel tables (design thread)

Collectors think in separate lists; the app must NOT replicate that. A plant carries axes —
`lifecycle_status` (mine/dead/sold/...), `offer_status` (not offered / for sale / for trade),
and Phase-3 list membership + a `wishlist` concept. **Import is how multiple lists enter the
app and collapse onto those axes:**
- *Per-file intent*: "this whole file/tab is my **trade list**" → mark every imported row
  `offer_status = for_trade`. Same for a sale list, or a wishlist (a not-yet-owned intent).
- *Per-column intent*: a single sheet with a "For Sale?"/"Trade?" column → map that column to
  the axis.
This is a **later increment**; v1 ships the mapping/preview/reconcile core that makes it trivial
to add. (Wishlist may need a lifecycle/own-state of its own — flagged for the lists phase.)

## Export-back / durability (the other half of "sync") — design thread, NOT in v1 build

The promise Stephen actually cares about. Two shapes, because "don't lose anything" varies:
- **(a) Fit their design** — write the collection back into a single familiar sheet shape.
- **(b) Relational export** — multiple tabs/sheets (plants, species, vendors, journal...) that a
  real database could be rebuilt from losslessly.
- **Photos are the known gap** — image files can't live in a sheet; needs a separate answer
  (export URLs/manifest? bundle? out of scope for first cut — name it, don't hide it).
CSV export already exists from day one (Phase 0). This thread extends it toward true round-trip.
