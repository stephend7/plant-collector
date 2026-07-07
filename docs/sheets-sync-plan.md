---
type: plan
title: Google Sheets Sync — Architect Contract & Conditions for Builder
description: Full-tier design contract for connecting ONE Google Sheet per user (drive.file + Picker), importing from it, mirroring the app back into it, and eventually two-way sync with conflict review. Steps B/C/D of the import-sync staircase.
updated: 2026-07-07
status: APPROVED by Stephen 2026-07-07 (design only — no code yet). Architect: Fable 5; separated Security plan-review: CONDITIONAL PASS 2026-07-07, all findings folded in. Build = later sessions on Sonnet, step B first.
---

# Google Sheets Sync — Architect Contract

> **Tier: FULL.** Triggers: OAuth (auth surface), a NEW egress path (the app writing to a
> user's Google Sheet), and no shipped analog. Per CLAUDE.md: a real separate Security
> agent reviews this plan, then the code. Design now (strong model), build later (Sonnet).
> Owner is non-technical; every consent and every write must be honest and reversible.

## Goal (one sentence)

Let the user hand the app exactly one Google Sheet and keep it in step with the app —
first reading it (import without downloading), then writing to it (the sheet becomes a
living backup), then true two-way sync — so that "the app disappears and I lose a decade
of data" can never come true.

## What Stephen has locked (dated steers — do not re-litigate)

- **Sync = durability insurance, not convenience** (2026-06-23). Eventually-consistent is
  fine; no real-time; manual "Sync now" is acceptable.
- **OAuth is acceptable; scope = `drive.file` + Google Picker ONLY** (2026-07-05). The app
  can see the one spreadsheet the user hands it, never the rest of Drive. Never the broad
  all-sheets scope (also avoids Google's restricted-scope audit).
- **Write consent = one-time upfront disclosure** (2026-07-07): when a user chooses full
  sync, ONE clear screen explains exactly what the app will and won't touch, then the
  OAuth write scope is requested once. Not per-run approval. (Per-run *transparency* —
  counts, reports — still applies; see "nothing silent" below.)
- **Published-sheet URL step CUT** (2026-07-07): publishing a sheet makes it readable by
  anyone with the link — wrong for data whose secrecy is a theft control (locations,
  prices). With OAuth accepted, the step's reason to exist is gone.
- **Onboarding fork** (2026-07-05→07): a new user with a spreadsheet chooses **"move in"**
  (one-time import, sheet retired) or **"full sync"** (sheet stays alive → the disclosure
  + write scope). The app explains the fork honestly.
- **Test fixture**: Stephen duplicates his old sheet as a sandbox the agents may freely
  write to during C/D testing. The real sheet is never a test target.
- Conflicts (step D) don't worry him; **the app writing to his sheet (step C) is the step
  he flags as risky — ceremony concentrates there.**

## The staircase (revised 2026-07-07)

| Step | What it is | Status | Risk center |
|------|-----------|--------|-------------|
| A | File-upload import (mapping → preview → reconcile core, import_batch + undo) | **SHIPPED**, security-reviewed, verified live 2026-06-23/24 | untrusted file parse (done) |
| B | **Connect & read**: Google sign-in, Picker picks ONE sheet, one-time import straight from it | this design | OAuth token handling |
| C | **Write**: app → sheet mirror (the durability milestone) + sync-ID stamping + disclosure screen | this design | writing to the user's precious sheet |
| D | **Two-way**: snapshot-diff pull, conflict review | this design (build last) | data corruption via silent merge |

Each step ships and is verified on its own; B is useful without C, C without D. Nothing in
B is wasted by C (same connection object), nothing in C by D (same write engine).

## Auth & scope design (applies to B, C, D)

- **Google Identity Services (GIS) token client, browser-only.** No server component; the
  app stays a static page on GitHub Pages. The OAuth **client ID is public by design**
  (public clients have no secret — Security: do not flag the client ID as a leaked
  credential).
- **Scope: `https://www.googleapis.com/auth/drive.file` only.** Grants access ONLY to
  files the user picked via the Google Picker (or files the app itself creates).
- **Access token lives in JS memory only. Never localStorage, never sessionStorage, never
  a cookie, never Supabase.** Tokens expire in ~1 h; when expired, GIS re-prompts (usually
  silent for a returning user). Losing the token on reload is the accepted cost of not
  persisting it.
- **Honest-consent fact the UI must handle:** `drive.file` has **no read-only variant**.
  Google's consent screen says "See, edit, create, and delete only the specific Google
  Drive files that you use with this app" — even at step B where we only read. The
  connect screen must say this in plain words *before* the Google popup: "Google's screen
  will say 'edit'. Until you turn on full sync, this app only reads. Here is everything
  it will ever do to this file: …" Anything less honest poisons the well.
- **Picker ↔ token wiring** is a known-finicky integration (`drive.file` only "sees" the
  picked file when the Picker is launched with the same OAuth token / app project).
  Builder must verify read access on the picked file immediately after picking and show a
  real error if the grant didn't take — not a silent empty state.
- **Nothing Google-related is stored server-side.** Supabase stores only: the spreadsheet
  ID, tab ID/title, the column mapping, and sync snapshots (all owner-only RLS rows).
  Spreadsheet IDs are identifiers, not credentials — access still requires the user's own
  Google session. Guard against ID substitution anyway (confused-deputy, Security
  2026-07-07): the app acts only on the ID the Picker callback itself returned, verified
  again at each stage (tab-list fetch, first write) — never trusting a value read back
  from `sheet_link` alone — and a connect flow may NEVER silently retarget an existing
  `sheet_link.spreadsheet_id` without re-running the Picker.
- **NEW trust boundary, named honestly (Security finding, 2026-07-07 — HIGH):** GIS
  (`accounts.google.com/gsi/client`) and the Picker loader (`apis.google.com/js/api.js`)
  **cannot be vendored** — Google requires loading them live. Until now this app has
  executed zero off-origin code (everything vendored); these two scripts will run in the
  same page as the token, the Supabase client, and all plant data. Mitigation, since SRI
  is impossible for live-rotating scripts: add a **CSP meta tag** restricting
  `script-src` to `'self' https://accounts.google.com https://apis.google.com` (with
  `connect-src`/`frame-src` similarly scoped to self + Supabase + Google endpoints) so no
  OTHER origin's script can ever load, even via a future injection bug. The CSP lands in
  the same change as the first GIS script tag, and the residual "we now trust Google-served
  code at runtime" is accepted and documented, not hidden.
- **OAuth consent screen config**: authorized JavaScript origins locked to exactly
  `https://stephend7.github.io` so the public client ID can't be replayed from a
  lookalike origin to phish tokens.

## Step B — Connect & read (one-time import from a private sheet)

Reuses the shipped A-core end to end; the ONLY new part is where bytes come from.

1. "Connect Google Sheet" → GIS token → Picker (spreadsheets view, single-select).
2. Fetch tab list (Sheets API `spreadsheets.get`, fields-limited), user picks the tab —
   same tab-picker UX as A.
3. Fetch values (`spreadsheets.values.get`, `valueRenderOption=UNFORMATTED_VALUE` +
   `dateTimeRenderOption=FORMATTED_STRING` — decided at build time against real fixtures;
   the point is: values, never formulas).
4. Feed the SAME mapping → preview → reconcile → import_batch pipeline as file upload.
   `import_batch.source_kind = 'sheet_oauth'` — note (Security, 2026-07-07): migration
   005's check constraint allows `('file','sheet_url','account')`, so adding
   `'sheet_oauth'` **requires a constraint-swap in migration 011**, reviewed with the
   new tables — it is NOT already covered. A `sheet_link` row records the connection.
5. **No generic "re-pull" button at step B.** Without sync-IDs in the sheet (impossible
   before write access), re-reading the sheet cannot match rows and would create
   duplicate plants (A's never-merge rule is correct for plants and merciless here). A
   second import of the same sheet is allowed but carries the same "this creates new
   rows" warning as re-uploading a file. Real refresh arrives with D.

**Sheets API data is NOT trusted more than an uploaded file.** Same inert-string
handling, same caps (rows/cols/cell length) enforced on the fetched values, same
`x-text`-only rendering, same no-write-before-confirm. The Web Worker isolation of A was
for a *binary parser* (SheetJS on zip/XML); B fetches plain JSON values via HTTPS and may
process them on the main thread, but the CELL VALUES remain untrusted text everywhere.

## Step C — Write: the app → sheet mirror (the durability milestone)

**Direction & truth:** in C, the app is the source of truth; the sheet is the mirror.
(The user editing the sheet is not synced back until D — the disclosure says so.)

### C1 first: the app-created backup spreadsheet (zero-risk write)

`drive.file` lets the app access files it CREATES without any Picker. So the write
engine's first target is a spreadsheet the app creates itself ("Plant Collector Backup"):

- Relational, multi-tab (plants / species / vendors / journal) — the promised shape-(b)
  export, continuously maintained instead of a manual CSV.
- Zero risk to the user's own sheet; nothing of theirs can be damaged.
- This is the **durability promise fulfilled** for move-in users too — they retire their
  old sheet but still get a live Google-side backup.
- Ships the entire write engine (batching, backoff, partial-failure handling) against a
  target where a bug costs nothing.

### C2 then: mirroring into THEIR connected sheet (the risky step)

Only after C1 is verified on the sandbox. Semantics:

- **Touches ONLY**: the one connected tab, the mapped columns, plus ONE new column the
  app adds (`App ID` — the stable sync-ID). Never other tabs, never unmapped columns,
  never formatting, never row deletion.
- **Matched rows**: mapped cells updated to app values. **New app plants**: appended as
  new rows at the bottom. **Plants deleted/undone in app**: the sheet row is NEVER
  deleted; if lifecycle is mapped it reflects status; otherwise rows just stop updating.
- **Formula cells in mapped columns**: detected at mapping/first-write time → warned, and
  **never overwritten** (a formula column is excluded from write-back; read-only in D).
- **First-write safety net**: before the very first write to a user sheet, the app
  duplicates the connected tab inside the same spreadsheet ("<tab> — backup 2026-07-07")
  and tells the user; plus the disclosure points at Google's own version history
  (File → Version history) as the deeper undo.
- **Sync-ID stamping (the first-link problem, solved by ordering):** the full-sync
  onboarding does import → consent → stamp as ONE flow: the import parse's row indices
  are carried through and IDs are written back immediately. Tripwire: before stamping,
  re-fetch the sheet and verify each target row still content-matches what was imported;
  any mismatch (user edited/re-sorted mid-flow) drops those rows into a side-by-side
  matcher review instead of stamping blind. A B-connected sheet returning later for full
  sync goes through the same content-match + review path.
- **Sync-ID = `plant.id` (UUID), stored verbatim in the `App ID` column.** Not sensitive:
  RLS means a UUID grants nothing. Never parsed, never positional.

### The one-time disclosure screen (Stephen's consent model — spec)

Shown once, when full sync is chosen, BEFORE the Google write-consent popup. Plain words:

> **What this app will do to your spreadsheet**
> - It can only see this one file — never the rest of your Drive.
> - It will update the columns you mapped, on the tab you chose. Nothing else.
> - It will add one column called "App ID" so it can tell rows apart.
> - It will add new rows when you add plants in the app.
> - It will NEVER delete rows, touch other tabs, or change your formatting.
> - Before its first change it saves a backup copy of your tab, and Google keeps
>   full version history (File → Version history) you can always restore.
> - Google's next screen says "edit, create, and delete" — that's Google's standard
>   wording for this permission; the list above is everything this app actually does.
> - **This sheet will contain your plant locations and prices — the same fields this
>   app normally keeps private.** Google Sheets sharing is controlled entirely by you:
>   if you share this sheet with anyone, they'll see those fields too.

The last line exists because of architecture.md's anti-theft guarantee ("location,
quantity, and acquisition price stay owner-only, always"): the mirror copies those
fields OUTSIDE the app's locked-doors boundary, into a file whose sharing settings the
app can neither see nor control (Security, 2026-07-07 — MEDIUM). Additionally, the
**mapping screen offers a "keep private fields out of the sheet" option** — a checkbox
excluding `location_data` / `acquisition_price` (and `quantity`) from the mirror, for
users who want the durability backup without theft-sensitive data leaving the app.

Accepting stores a dated consent record on the `sheet_link` row (which disclosure
version was accepted, when) — so future-us can prove what was promised.

### Run mechanics ("nothing silent" without per-run approval)

- **Manual "Sync now"** in v1 (+ an optional gentle staleness hint later; never nagging).
- A run computes the full diff, applies it in ONE `values.batchUpdate` (+ one append),
  then reports real counts: "Updated 12 rows, added 3." All-or-nothing per request;
  snapshots (D) update only after success, so re-runs are safe after any failure.
- **Tripwires escalate to a preview** (this is not per-run approval; it is the
  surprise-gate): first-ever C2 write; header fingerprint changed (schema drift → forced
  re-map, sync blocked until resolved); or a run that would touch more than
  TRIPWIRE_ROW_FRACTION (default 50%) of mapped rows. Tripwire runs show the counted
  plan and require one confirm — same "counted confirm" family as import-undo.
- **Quotas & payload size**: Sheets API per-user rate limits are generous for batched
  calls (single-digit requests per run regardless of collection size). Exponential
  backoff on 429; never per-row calls. Large collections chunk writes to stay under the
  API's per-request payload limits — multiple `batchUpdate` calls when needed, still
  reported as ONE logical run (Security, 2026-07-07).

## Step D — Two-way (snapshot-diff pull + conflict review) — build LAST

The full problem list gathered 2026-06-29 (import-sync-design memory) is the checklist
this section must survive. Core design:

- **Snapshot-and-compare, not timestamps.** After every successful sync, store per-row
  normalized values (keyed by sync-ID) as "what was last agreed." Next run, per row:
  sheet=snapshot & app changed → push; app=snapshot & sheet changed → pull;
  both changed → **CONFLICT — never silently pick a winner**; neither → no-op.
- **Row-level conflicts in v1** (any overlap → review whole row, old vs new side by
  side, user picks). Field-level merging is a later refinement if real conflicts prove
  common.
- **Normalization before compare** (kills false conflicts): trim; smart-quote →
  straight; numeric coercion ("01" vs 1); dates canonicalized through the existing
  precision logic; formula columns compared on computed value but never written.
- **Row edge cases**: duplicated `App ID` in sheet → those rows error out of the run
  (never merge/overwrite on a dup); blank/removed ID or brand-new row → explicit
  "new rows" review step (import-style preview), never auto-assumed; row vanished from
  sheet → flag "missing — review", NEVER auto-delete the app plant (deletion only ever
  as an explicit, counted, user-confirmed action).
- **Import-undo × sync**: undoing a batch whose plants are stamped in a connected sheet
  warns first; after undo, orphaned sheet rows surface in the next run's review as
  unknown-ID rows. Sync never deletes them.
- **The tripwire gates BOTH directions (Security, 2026-07-07 — HIGH):** a pull that
  would change or flag more than TRIPWIRE_ROW_FRACTION of rows (a global sort,
  find-and-replace, mass reformat) stops for a **run-level counted confirm** before
  entering row-by-row review — same tripwire family as C's push gate. Row-level review
  alone is not a mass-change defense; the aggregate gate is.
- **Pulled cell values are still untrusted text (Security, 2026-07-07):** every pull
  re-applies B's caps (rows/cols/cell length, reject-not-truncate), and the
  conflict-review UI — a NEW rendering surface — shows both sides via the same
  inert-text (`x-text`) path as the import preview. This holds on every pull, not only
  at first connect.
- **Single-editor scope stated in-app**: one user, one device syncing at a time; no
  simultaneous-edit races handled in v1.
- Photos/journal do not round-trip (photos: link-only later — see photo-storage design;
  journal: covered by the C1 relational backup, not by the mirror tab).

## Data model (migration 011 — DRAFT, Security reviews with the plan)

```sql
create table sheet_link (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  spreadsheet_id    text not null,            -- Google file ID (identifier, not a credential)
  spreadsheet_name  text,                     -- shown to the user
  tab_id            integer,                  -- sheet/tab gid
  tab_title         text,
  kind              text not null default 'user_sheet'
                      check (kind in ('user_sheet','app_backup')),
  mode              text not null default 'read_only'
                      check (mode in ('read_only','mirror','two_way')),
  mapping           jsonb,                    -- column↔field map + header fingerprint
  consent_version   text,                     -- which disclosure text was accepted
  consent_at        timestamptz,
  last_sync_at      timestamptz,
  last_sync_status  text,
  created_at        timestamptz not null default now()
);
-- RLS: owner_all, same pattern as other leaf tables.

create table sheet_row_snapshot (
  id             uuid primary key default gen_random_uuid(),
  sheet_link_id  uuid not null references sheet_link(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plant_id       uuid references plant(id) on delete set null,  -- null = orphaned row we still track
  row_values     jsonb not null,              -- normalized last-agreed values
  updated_at     timestamptz not null default now(),
  unique (sheet_link_id, plant_id)
);
-- RLS: owner_all. on delete set null keeps orphan detection after plant deletion/undo.

-- Also in 011 (Security, 2026-07-07): swap import_batch.source_kind's check constraint
-- to add 'sheet_oauth' — migration 005 only allows ('file','sheet_url','account').
alter table import_batch drop constraint import_batch_source_kind_check;
alter table import_batch add constraint import_batch_source_kind_check
  check (source_kind in ('file','sheet_url','account','sheet_oauth'));
```

No Google token, refresh token, or anything credential-shaped is EVER stored in these
tables or anywhere in Supabase.

## Explicitly OUT (named, not hidden)

- Background/scheduled sync; multi-device simultaneous sync; field-level conflict merge.
- Photo bytes or photo links in the mirror tab (separate design — photo-storage memory).
- Two-way journal sync (C1 backup exports journal one-way).
- Published-URL read (cut 2026-07-07, see decisions.md).
- Any Google scope beyond `drive.file`.

## Security model — Conditions for Builder

1. **Token in memory only** — grep-provable: no `localStorage`/`sessionStorage`/cookie/
   Supabase write anywhere near the token. Token variable scoped, not on `window`.
2. **Scope string is exactly `drive.file`** — a test asserts the token request contains
   no other scope; adding a scope is a design change, not a tweak.
3. **All fetched cell values are untrusted text**: same caps as file import enforced on
   fetched ranges (max rows/cols/cell length, reject-not-truncate); `x-text` rendering
   only; formula strings inert; CSV-injection prefixing on any export path (already
   shipped in A — extend coverage to the C1 backup writer, which must prefix
   `= + - @ \t \r` cells it writes… **no**: C1 writes via the Sheets API with
   `valueInputOption=RAW`, which never interprets input as formulas — Builder must use
   RAW, never USER_ENTERED, for every write).
4. **`valueInputOption=RAW` on every write** (the Sheets-side formula-injection defense;
   a plant named `=IMPORTRANGE(...)` must land as literal text).
5. **No write before consent — honest framing (reworded per Security, 2026-07-07)**:
   the app's own UI never triggers a C2 write before `consent_at` + `consent_version`
   are recorded on the sheet_link, and the disclosure text shown is the one versioned
   in the repo. This is an **application-level gate, not a cryptographic one**: the
   OAuth token is the user's own credential living in their own browser, so nothing
   stops that browser session from writing to the sheet outside the app's UI (e.g.
   devtools). The gate guarantees the APP never acts without the user's agreement — it
   does not, and cannot, constrain the user's own account acting on itself.
6. **Write blast-radius**: every write request targets only the connected tab; mapped
   columns + App ID column only; append-only for new rows; no delete calls anywhere in
   the codebase (grep-provable: no `batchUpdate` with `deleteDimension`/`deleteRange`).
7. **First-write backup tab** created and verified present before the first C2 mutation.
8. **Tripwires cannot be disabled silently**: drift → sync blocked until re-map; >50%
   change → counted confirm; these paths need tests with real fixtures.
9. **RLS on new tables** mirrors existing owner-only policies; `sheet_row_snapshot`
   parent-ownership checked (same `app_owns_*` helper pattern).
10. **Honest failure**: every run ends in a written report (updated/added/skipped/
    errored counts) persisted to `last_sync_status`; a thrown error mid-run must never
    leave `last_sync_at` advanced or snapshots updated.
11. **Sandbox-only testing**: agents write only to Stephen's designated sandbox sheet;
    the real sheet's ID never appears in test code or fixtures.
12. **CSP ships with the first GIS script tag** (grep-provable: the `<meta http-equiv=
    "Content-Security-Policy">` tag exists in the same commit that adds any off-origin
    `<script src>`; `script-src` limited to `'self'` + the two Google origins).
13. **Google Cloud config checklist**: authorized JavaScript origins = exactly
    `https://stephend7.github.io`; consent screen scope list = `drive.file` only.
14. **RLS test matrix covers cascade ordering** on the new tables: deleting a
    `sheet_link` (cascade) vs deleting a `plant` (set null) never leaves a
    `sheet_row_snapshot` readable by another user or orphaned outside `auth.uid()`
    scoping (both tables key on `user_id = auth.uid()` directly — verify, don't assume).
15. **Picker-ID pinning**: the spreadsheet ID acted on is re-verified against the
    Picker's own callback response at connect, tab-list fetch, and first write; no
    connect path can retarget an existing sheet_link without a fresh Picker run.

## Build order & verification gates

1. **B** (connect + read + one-time import): verify live on the sandbox sheet with the
   throwaway account — Picker grant works, tab list correct, import counts reconcile
   with `select count(*)`, re-import warns. iPhone/WebKit pass required (Picker popup
   behavior on iOS Safari is a known risk — verify early, not last).
2. **C1** (app-created backup): verify the created file appears in the throwaway
   account's Drive, tabs/counts match the DB exactly, `RAW` input proven by a
   formula-shaped plant name landing inert.
3. **C2** (mirror into sandbox): stamp IDs, edit app → sync → sheet updates; verify
   untouched columns/tabs byte-identical (fetch before/after and diff); backup tab
   exists; tripwire fires at >50%.
4. **D** (two-way on sandbox): scripted conflict matrix (app-only edit, sheet-only edit,
   both-edit, re-sort, row delete, ID dup, ID blank, new row, header rename) — each case
   lands in the designed bucket, none silent.
5. Each step: code-stage Security review before Tester; one deploy per step; decisions.md
   updated in the same change.

## Open questions (Architect's leanings; none block Security review)

1. **C1 backup cadence** — update on every "Sync now", or its own button? *Lean: same
   button; one sync action keeps the mental model simple.*
2. **Mirror tab shape for full-sync users who ALSO want the relational backup** — allow
   both links at once? *Lean: yes, they're independent sheet_link rows (kind
   differs); no extra machinery.*
3. **TRIPWIRE_ROW_FRACTION default** — 50% is a guess; tune after real use.
4. **Disclosure copy** — Stephen should read and edit the plain-words screen text above;
   it's his promise to his users.
