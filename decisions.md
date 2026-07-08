# Decisions Log — Plant Collector Database

Newest decisions on top. Each entry: what was decided, and why. Companion to `architecture.md`.

---

## 2026-07-07 — Sheets sync step C1 BUILT & security-PASSED (app-created Google Drive backup; build 2026-07-07d — awaiting live verification)

The first write path to Google, built per the approved contract (`docs/sheets-sync-plan.md`,
step C1 only — the zero-risk half of step C). On **Fable 5** (Stephen's explicit call again;
he also decided 2026-07-07 that **C2 stays on Fable 5** — stronger model on the step he flagged
as risky, accepting the usage-budget cost; the Sonnet rotation default stands elsewhere).
FULL TIER, pipeline honored: build → **REAL separated Security agent reviewed the actual diff**
(reviewer ≠ author) → **CONDITIONAL PASS** (1 MEDIUM, 2 LOW, 3 INFO) → all findings fixed →
**independent re-verification of the fixes → PASS.** C2 (writing into the user's OWN sheet)
is deliberately NOT in this build — it gets its own session and its own Security review.

**What shipped in the code:**
- **"Google Drive backup"** in the main menu (+ a cross-link from the Export dialog — the
  two-entry-points rule): the app creates its own spreadsheet ("Plant Collector Backup") via
  the Sheets API and rewrites 4 tabs (Plants / Species / Vendors / Journal — full relational
  export, the promised shape-(b) backup) on each manual "Back up now". `drive.file` lets the
  app write to files it CREATES with no Picker; nothing the user made can be touched.
- **Write engine** (the machinery C2 will reuse): chunked `values.batchUpdate` with
  **`valueInputOption=RAW` on every write** (formula-shaped names land inert), 429/5xx
  exponential backoff, **no delete calls anywhere** (stale rows are blanked via `batchClear`,
  never removed), and overwrite-first/trim-after ordering so a mid-run failure can never leave
  the backup emptier than it started.
- **Consent + honesty:** first open shows a plain-words screen (creates its own file; can't
  see the rest of Drive; never touches user-made sheets until C2 asks separately; **the backup
  contains locations and prices** — the anti-theft fields — and sharing the file is the user's
  choice). The tap on "Create backup" is recorded as `consent_version`/`consent_at` on the
  `sheet_link` row (kind='app_backup'). Runs report real counts; `last_sync_at` advances ONLY
  after a fully successful write; failures record an error status honestly.
- **Deleted-file handling:** a 404 on the stored file (deleted in Drive / different Google
  account) is explained and offers "Create a new backup file" — never a silent duplicate.

**Security findings worth remembering (all fixed):**
- [MEDIUM] the backup originally refreshed plants via `loadPlants()`, which swallows fetch
  errors — a failed refresh could have overwritten a good backup with stale/empty data and
  still reported success. Now a CHECKED fetch aborts the run on error.
- [LOW] a failed "existing backup?" lookup looked like "no backup yet" and invited a duplicate
  Drive file; now unknown state disables the button + a pre-create re-check reuses any
  existing row.
- [LOW] spreadsheet **creation** is exempt from the retry/backoff (not idempotent — a retry
  after a transit error would strand duplicate files); reads and full-overwrite value writes
  stay retryable.
- Judgment call the reviewer accepted: NO hard check that the backup file is still literally
  named "Plant Collector Backup" — the user may rename their own file, and a title proves
  nothing; instead the app syncs the live name back into the UI. Real guards: ID pinned from
  the create response, kind='app_backup' row filter, owner-only RLS.

**No schema change needed** — migration 011 (shipped with B) already carries kind='app_backup',
mode, and the consent columns. No CSP change — `sheets.googleapis.com` was already in
`connect-src`.

**Verification status: NOT yet verified live** (this entry updates when it is). The OAuth
client's authorized origin is locked to `stephend7.github.io`, so the flow can only run on the
deployed site — same as B. Gate 2 from the plan: file appears in the Google account's Drive,
tab counts match `select count(*)` per table, and a formula-shaped plant name (`=IMPORTRANGE…`)
lands as inert text. Local checks done: app script parses clean (JavaScriptCore), Security PASS
on the diff. Worktree note: the sandbox preview server still can't serve files (same
2026-06-17 limitation) — `.claude/launch.json` was updated to point at the worktree with an
explicit directory, which fixed startup but not per-request file reads.

---

## 2026-07-07 — Sheets sync step B SHIPPED & VERIFIED (connect & read; final build 2026-07-07c)

Built the same day the design was approved (entry below), on **Fable 5** (Stephen's explicit call
for this build — the playbook's Sonnet default stands for future steps). FULL TIER, pipeline
honored: approved contract (`docs/sheets-sync-plan.md`) → build → **REAL separated Security agent
reviewed the actual diff** (reviewer ≠ author) → verdict **CONDITIONAL PASS, zero critical/high**
→ all actionable findings applied → Stephen created the Google Cloud project (client ID / API key
/ project number into `app/config.js`) → migration 011 run in Supabase → deployed → **verified
end-to-end in Chrome AND on Stephen's iPhone Safari, including the named Picker-popup risk.**
**STATUS: SHIPPED.**

**Two real bugs found live during verification, both fixed same session (not false-green — see
the "verify your verification" note below for how the first one nearly was):**

1. **Build `07a` broke the ENTIRE live app (blank page).** The CSP's `script-src` had `'self'
   'unsafe-eval'` + the two Google origins but no `'unsafe-inline'`. CSP's `'self'` covers script
   FILES (`<script src>`), never inline `<script>` content — and this app's whole business logic
   is one inline script block that predates the CSP by months. Result: the inline script never
   ran, `Alpine.data('app', ...)` was never registered, `x-data="app"` fell back to Alpine's
   empty-object default, and the page rendered nothing — with ZERO fatal top-level errors logged
   (only a cascade of caught-and-swallowed `ReferenceError`s from inside Alpine's directive
   evaluator, one per state property). **Caught within minutes** by the live-Chrome verify pass
   that immediately followed the deploy (not skipped, not assumed). **Fix (build `07b`):** added
   `'unsafe-inline'` to script-src, matching the already-accepted style-src trade-off — the CSP's
   real new protection (no OTHER origin can ever load script/style here) stays fully intact; what
   it can't additionally stop is a future XSS injecting inline content, which was equally
   unprotected before any CSP existed. Re-verified clean: build marker correct, zero console
   errors, `_x_dataStack` populated, both Google scripts (GIS + Picker) loaded and ready under the
   live CSP.
2. **`guessImportMap`'s Notes auto-detect (`/note|descr|comment|growing/`) collided with
   Form/Descriptor's (`/descriptor|form\b|variety|cultivar/`)** — a header spelled "Descriptor"
   satisfies both (via the bare "descr" fragment), so the same source column got silently mapped
   into BOTH target fields. Found by Stephen re-testing the mapping screen against his real sandbox
   sheet. **Fix (build `07c`):** excluded literal "descriptor" from the Notes match — "Description"
   still auto-maps to Notes as before, "Descriptor" now maps only to Form/Descriptor. This bug
   predates step B (same shared mapper file imports already used) and is now fixed for both paths.

**Verified live end-to-end (Chrome + iPhone Safari, Stephen driving, real sandbox sheet):**
connect → consent screen → Google popup → Picker shows both his spreadsheets → tab picked → values
fetched → mapping screen (post-fix, correct) → preview (151 plants, counts reconciled) → import →
result counts confirmed → **undo removed exactly that batch, nothing else touched.** iPhone Safari
separately confirmed: consent screen renders correctly, Picker popup opens cleanly and lists
spreadsheets — **the plan's one named risk (iOS Picker-popup behavor) is clear.**

**Steer captured mid-verification (Stephen): no merging of extra/unmappable sheet columns into
Notes** — a column with no true app counterpart stays in the sheet, UNMAPPED (sync already never
touches unmapped columns, so nothing is lost); a merged Notes blob can't be split back into source
columns once two-way sync exists. A multi-column→Notes mapper upgrade was offered and DECLINED for
exactly this reason — logged in the `import-sync-design` memory so a future session doesn't
rebuild it. Also logged (ui-polish-backlog memory): the import preview table only shows 8 fixed
columns regardless of what's mapped — pre-existing UX gap, confirmed confusing, deferred (not
blocking, everything mapped still imports correctly).

**NEXT:** step C (write — app-created backup first, then mirror into the user's sheet) is a
separate future session with its own build-stage Security review before any write code lands.

**What shipped (worktree branch, one logical change):**
- **Migration 011** (`app/migrations/011_sheet_link_and_sheet_oauth.sql`): `sheet_link` +
  `sheet_row_snapshot` (owner-only RLS keyed on `user_id = auth.uid()` directly; parent-ownership
  guards `app_owns_sheet_link` / `app_owns_plant` per the 005 pattern; RLS enabled before policies
  = fails closed; `unique(user_id, spreadsheet_id, kind)` added from a Security LOW), and the
  `import_batch.source_kind` constraint swap adding `'sheet_oauth'` (005 did NOT allow it).
- **CSP meta tag in the same change as the first off-origin scripts** (contract condition 12):
  script-src = `'self' 'unsafe-eval'` + accounts.google.com + apis.google.com ONLY. `'unsafe-eval'`
  is required by stock Alpine (`new Function` for x-* expressions) and permits no cross-origin
  loading — reviewer ruled the deviation correct. gstatic.com added to img/style ONLY (Picker
  dialog shell assets), NEVER script-src. Known named gap: `style-src 'unsafe-inline'` (the app's
  inline styles predate the CSP) — CSS injection isn't blocked; script injection is.
- **`GSheet` closure module** in `app/index.html`: token in closure memory ONLY (grep-provable —
  no localStorage/sessionStorage/cookie/Supabase/window anywhere near it); scope exactly
  `drive.file` + a granted-scope check that HALTS if Google grants more; GIS + gapi scripts
  lazy-loaded only when connecting (preloaded during the consent read so the popup opens inside
  the user's tap — the iOS Safari popup rule); Picker single-spreadsheet; **the ID acted on comes
  only from the Picker's own callback** (condition 15); tab-list fetch doubles as the immediate
  read-grant check (fails loudly, never a silent empty state); values fetch is range-capped to the
  file-worker's exact caps (GCAP mirrors `lib/import-worker.js` CAP; over-long cells truncate +
  count with a visible note — the plan doc's stale "reject-not-truncate" parenthetical was
  corrected per the reviewer's ruling: mirror the proven A control, fix the doc).
- **Feeds the untouched A-core**: fetched values → same `_receiveRows` seam → same mapping →
  preview → `runImport` (now `source_kind: 'sheet_oauth'` for the g-path) → same batch + undo.
  A `sheet_link` row (kind `user_sheet`, mode `read_only`, mapping jsonb) records the connection.
  **No re-pull button by design** (no sync-IDs yet → re-read can only create rows); reconnecting a
  previously-imported sheet shows an honest "adds NEW copies, never merges" note.
- **Plain-words consent step** before Google's popup (the honest-consent rule): says Google's
  screen will read "edit" because drive.file has no read-only variant, that step B only reads,
  and that a future write step will ask separately.
- **NO step C/D code**: grep-provable zero write-capable Sheets calls in the codebase. C needs its
  own build-stage Security review before any write code lands.

**Deploy-safety notes:** the build is safe to deploy BEFORE migration 011 (only the g-path touches
the new tables and it fails with an honest error; file imports don't) and before the Google values
exist (the connect button explains "not set up yet"). The CSP is the one all-users change — the
live pass must regression-check photos/import/export under it, not just the new flow.

**Security review (separated agent, read-only): CONDITIONAL PASS.**
MED gstatic-absent-from-CSP (fixed: img/style only) · MED unused www.googleapis.com in connect-src
(fixed: dropped — least privilege) · MED plan-doc contradiction on truncate-vs-reject (fixed in the
doc) · LOW sheet_link upsert race (fixed via unique constraint) · LOW public API key/appId (by
design; console-side referrer restriction is Stephen's checklist item) · INFO passes on: token
scoping, RLS pattern match, Picker-ID pinning end-to-end, A1-range escaping, CSV re-export
injection coverage, x-text-only rendering of all sheet-derived strings.

**Verify-your-verification catch (process honesty):** the first JS parse check this session was a
FALSE GREEN — the `jsc` binary path was empty, the command never ran, and the shell pipeline
reported success anyway (the playbook's exact missing-binary trap). Caught, redone with a proven
instrument (control file that must fail, then the real script): the app's single inline script
parses clean (jsc reached runtime and stopped only at the browser-only `supabase` global). Also
found: an HTML comment containing literal `<script>` breaks naive script-extraction regexes.

---

## 2026-07-07 — Google Sheets sync DESIGNED & approved (no code yet; build later on Sonnet)

The two-way-sync design session paused 2026-07-05 resumed and finished on **Fable 5** (the
"design on the strong model, build later" plan). Full-tier process: Architect contract written
(`docs/sheets-sync-plan.md`) → **real separated Security agent reviewed the PLAN** (Sonnet,
reviewer ≠ author) → verdict **CONDITIONAL PASS**, all 10 findings folded back into the doc →
summary presented → **Stephen approved the design 2026-07-07**. No feature code exists yet.

**Decisions locked today (Stephen):**
- **Write-consent model = ONE-TIME UPFRONT DISCLOSURE** (finishing the thought he paused
  2026-07-05): choosing full sync shows one plain-words screen listing exactly what the app
  will/won't touch, then requests the OAuth write scope once. NOT per-run approval — but per-run
  transparency (counted reports) and surprise-tripwires (first write, schema drift, >50% of rows
  changing, in BOTH directions) still apply.
- **Published-sheet-URL step CUT from the staircase.** Publishing a sheet makes it readable by
  anyone with the link — wrong for data whose secrecy is a theft control (locations, prices),
  and with OAuth accepted its reason to exist (avoiding OAuth) is gone. Staircase is now:
  A file upload (shipped) → B OAuth connect+read → C write → D two-way.
- **Scope stays `drive.file` + Google Picker only** (re-confirmed): the app can touch ONE
  user-picked spreadsheet, never the rest of Drive. Within a spreadsheet, sync binds to ONE
  user-chosen TAB — remnant/unused tabs are never read past their names, never written.

**Key architecture calls (see the plan doc for full detail):**
- **C splits into C1 → C2:** the write engine debuts against an app-CREATED backup spreadsheet
  ("Plant Collector Backup", relational multi-tab — `drive.file` covers app-created files with
  no Picker) where a bug costs nothing, and only then mirrors into the user's own sheet.
- **First-link ID stamping:** full-sync onboarding does import → consent → stamp-IDs as one
  flow reusing the parse's row indices, with a re-fetch content-match tripwire before stamping
  (mid-flow sheet edits drop into a side-by-side matcher, never stamped blind).
- **Two-way (D) = snapshot-and-compare** per the 2026-06-29 problem list: per-row last-agreed
  snapshots; both-changed = conflict shown side-by-side, never a silent winner; vanished sheet
  row NEVER auto-deletes an app plant; row-level conflicts in v1.
- **Migration 011 (draft in plan):** `sheet_link` + `sheet_row_snapshot` (owner-only RLS) +
  `source_kind` check-constraint swap to add `'sheet_oauth'` (005's constraint does NOT already
  allow it — Security caught the plan's original wording implying otherwise).

**Security review highlights (all now in the plan):** GIS/Picker scripts are the app's FIRST
off-origin runtime code (everything else is vendored) → CSP meta tag ships in the same commit
as the first Google script tag; the C2 mirror copies theft-sensitive fields (location, price)
outside the RLS boundary into a user-shareable sheet → disclosure says so outright + mapping
gets a "keep private fields out of the sheet" exclusion option; the mass-change tripwire must
gate PULLS not just pushes; consent gating honestly reframed as an app-level (not cryptographic)
guarantee in a client-only architecture; Picker-ID pinning against confused-deputy retargeting;
`valueInputOption=RAW` on every write (Sheets-side formula-injection defense).

**Next step when building starts (Sonnet, per the model rotation):** Step B alone — GIS token
client (memory-only token), Picker, tab picker, one-time import through the existing A-core.
Verify early on iPhone/WebKit (Picker popup behavior on iOS Safari is a named risk). Stephen
will duplicate his old sheet as the writable sandbox before C/D testing.

---

## 2026-07-05 — Inventory mode, lite/rolling version (build 2026-07-05a)

Built the lightweight, rolling Inventory feature from `ui-polish-backlog` #4 (Lite tier; Architecture + Build + inline Security, no separate agent — non-risky owned-row-write UI). Deliberately the SIMPLE half: mark-seen + gap-finder only. The harder reconciliation half (duplicate-guard when a physical plant may already be in the DB, "＋ found one here" add shortcut, moved-shelf handling) is **deferred by Stephen's own call** — ship lite, let real use on his phone make the harder answers clearer before designing them.

**What shipped:**
- New screen `screen==='inventory'`, reached from the ⋯ main menu (disabled until the collection has plants, same pattern as Export).
- **By shelf:** groups in-collection plants by `growing_location` (no finer "tray" level, per Stephen). Tap a shelf → its plants → **Mark seen**.
- **Mark seen** stamps `plant.last_seen_at`; a ± stepper (defaults to current `quantity`) lets him adjust the count in the same tap. Only writes `quantity` if it actually changed. **No journal event is written** — marking seen must not spam the timeline (Stephen's explicit "no sessions, no nagging" rule); only a real count change touches the row, and even that logs nothing (consistent with the tap-to-edit tiles' quantity path).
- **Due for a look:** all in-collection plants sorted least-recently-seen first, never-seen at the very top (`last_seen_at` null → sorts before any date). This is the on-demand gap-finder — the app NEVER auto-flags "missing"; Stephen consults it when HE feels he's done his rounds.
- `seenLabel()` gives friendly relative text (Never seen / Seen today / Seen N days ago / weeks / months).

**Data model:** migration `010_inventory_last_seen.sql` adds two nullable columns to `plant` — `last_seen_at timestamptz`, `last_seen_count integer`. No FK, no check, **no RLS change** (existing owner-only policies on `plant` already cover every column). Followed the migration-009 precedent (migration file is canonical; `schema.sql` not re-edited). `PLANT_SELECT` extended to load the two columns.

**Security (inline, PASS — no new surface):** write path is the same RLS-protected `sb.from('plant').update(...).eq('id',p.id)` — owner-only RLS means a user can only ever update their own rows whatever id is passed. Quantity sanitized `Math.max(0,Math.floor(Number()||0))` (no negative/NaN/float). `last_seen_at` is a client ISO timestamp but it's the user's own convenience field, not an auth/trust input. No egress, no upload, no injection surface.

**Verified live END-TO-END** (Chrome, `test2@test.com` — the old `test@test.com` password was lost and can't be email-reset on a fake address, so a fresh throwaway was made; build `2026-07-05a`): created 2 throwaway *Drosera* on Shelf A / Shelf B → By shelf grouped them correctly (1 + 1) → Mark seen flipped "Never seen"→"Seen today" and **the write survived a full page reload** (real Supabase round-trip, not local state) → Due for a look sorted never-seen above seen → the ± stepper bumped one plant 1→3 and that landed on the actual `plant.quantity` (checked on the detail page) → the plant's journal still showed ONLY its original Acquired event (no seen-spam). **NOT yet confirmed on Stephen's iPhone (WebKit)** — pending his real-device pass.

**Process note (surfaced, not buried):** partway through I mis-pointed the local test server at the MAIN working tree instead of this task's worktree, so edits briefly landed on `main` instead of the `claude/wizardly-meitner-0f7aa1` branch. Caught it with `git status`, moved the changes to the worktree branch, confirmed `main` clean. No data lost, nothing pushed in a bad state.

---

## 2026-07-01 — Multi-select category filter on the genera page (build 2026-07-01g)

Stephen noticed the genera-page (Plants tab) category filter only let him pick one category at a time and read it as a regression. Checked git history: it was actually single-select from day one (`galleryCatId`, a single string) — only the separate List tab ever had multi-select (`listCatIds`, an array with AND logic, added earlier). Asked Stephen directly; he wants multi-select here too, to match the List tab.

**Fix:** renamed `galleryCatId` → `galleryCatIds` (array), added `toggleGalleryCat(id)` (same toggle pattern as the List tab's `toggleListCat`), and switched `generaGallery()`/`genusPlants()` to the same AND-logic filter already used by `listGroups()` (a plant must carry ALL selected categories). Chips now show selected state via `.includes()` instead of `===`; added a "matching all N categories" hint when 2+ are picked, mirroring the List tab.

**Verified:** Chrome (`test@test.com`) — multiple chips select together, "matching all 2 categories" hint appears, "All categories" clears correctly, drill-down still narrows correctly (no regression of the `2026-07-01e` fix below), no console errors. **CONFIRMED by Stephen on his iPhone** (same pass as the Grid/List toggle below — both were live together when he tested).

---

## 2026-07-01 — Grid/List view toggle + "All categories" label fix (build 2026-07-01f)

**Grid/List toggle (Lite tier; Architecture pass, Build pass — real feature from `ui-polish-backlog` #6):** Right after an import nobody has photos yet, so the genus gallery was a wall of blank leaf-placeholder tiles. Added a Grid/List toggle to the Plants tab, reusing the existing `.seg` segmented-control styling (same component as the Journal tab's All/Photos switch). List mode keeps the genus drill-down (genus rows → tap → plant rows as text), staying distinct from the separate flat List tab. **Smart default:** opens in List when under 40% of plants have a cover photo, Grid otherwise; the first manual tap overrides this permanently (saved to `localStorage['plantsViewMode']`, same pattern as `lastGenusId`). **Grid density:** `.gallery-grid` now gets a `cols-3`/`cols-4` class (via `gridDensityClass()`) so tiles shrink as a genus/collection grows past 6/24 items — thresholds are a judgment call, not measured. Both view modes keep the existing Category/Country filter pills. No new Supabase calls (List mode is strictly cheaper — no photos needed), no auth/RLS/import surface touched.

**"All categories" label fix:** the genus-gallery's category-filter clear button read "All genera" — copy-paste mislabel from before Categories existed there, confusing since the alternatives are categories (Carnivorous, Orchid, Plant, Seed…), not other genera. Renamed to "All categories" to match the identical button already correctly labeled on the List tab.

**Verified:** Chrome (`test@test.com`) — toggle switches cleanly, List mode shows genus/plant rows with no blank tiles, category filter still narrows the List-mode drill-down correctly, manual choice persists via `localStorage` and overrides the smart default on reload, no console errors. **CONFIRMED by Stephen on his iPhone** against his real ~166-plant collection (a much better real-world test of the smart-default threshold than the small Chrome test account).

**Tooling note (this session):** GitHub Pages + Chrome served a stale cached copy of the app on a repeat visit to the identical `?u=1` URL after a push — the query string must be a fresh/unique value each time to force a real reload, not just present. Also confirmed (again) that the local static-preview sandbox (`preview_start` tool) cannot open files at all, even with an explicit, correct, hardcoded path passed via `directory=` — a `PermissionError` inside `open()` gets silently converted to a plain 404 by `http.server`, so it looks like a missing file rather than a permissions error. Chrome-against-the-live-site remains the only working verification route in this environment.

---

## 2026-07-01 — Category filter not applied on genus drill-down (build 2026-07-01e)

Found by Stephen during the build-2026-07-01d verification walkthrough: tapping a category chip (e.g. "Seed") on the genera-gallery screen correctly filtered the per-genus counts, but tapping into a genus from there showed ALL plants in that genus, ignoring the category filter.

**Root cause:** `generaGallery()` (the genus-list screen) filtered by both `galleryCatId` and `galleryCountry`, but `genusPlants()` (the drill-down list, called when a genus is tapped) only re-applied the `galleryCountry` filter — the category filter was missing entirely from that function.

**Fix:** `genusPlants()` now also filters by `galleryCatId`, mirroring the existing country-filter line right above it. One-line change, no new pattern — same shape as the already-shipped country filter.

**Verification:** Could not drive Chrome/Supabase live in the same pass as the fix (fix was local/uncommitted at write time, so nothing deployed for Chrome to hit; the local static-preview sandbox couldn't open files at all, confirmed via reproducible test — an environment limitation, not a code issue). **CONFIRMED by Stephen on his iPhone** after push, using the same "Seed" category test that surfaced the bug.

---

## 2026-07-01 — Main menu + native-Save-As export dialog (build 2026-07-01a), Undo-Import bug fix (build 2026-07-01b)

**Main menu:** Stephen found the List-tab-only up/down-arrow import/export icons unrecognizable, and was surprised export silently fired a download with no confirm/rename/cancel. Fix, both his calls via AskUserQuestion: (1) standard Feather-style tray-arrow icons (upload/download/refresh) used consistently in the List tab AND a new ⋯ menu on the main Plants screen (Import / Export / Sync-disabled-"coming soon" / Sign out / build version — sign-out+version moved out of the old always-visible page-bottom footer into this one home); (2) native OS "Save As" (`showSaveFilePicker`) where the browser supports it (Chrome/Edge desktop), in-app rename dialog (Cancel/Download) everywhere else since Safari/iPhone have no folder-picker API at all — a cancelled native picker does nothing (no silent fallback download).

**Verified (test@test.com initially, then Stephen's real account after an account-mismatch safety check — see below):** menu opens/closes (tap-outside works), Import row opens the importer, List-tab icons updated. Export fallback dialog tested by temporarily disabling `showSaveFilePicker` in-page: Cancel does nothing, renamed Download fires cleanly. Native Save-As itself not driven live (outside what the Chrome extension can screenshot/cancel safely) — Stephen to click it once himself to see the real OS picker.

**Safety check that surfaced a real fact:** mid-verification, the signed-in account showed `stephend7@gmail.com` (real account) with 166 plants matching the CP DB2.xlsx import profile, not the expected `test@test.com` throwaway. Flagged to Stephen before proceeding — he confirmed **he ran that import himself, directly into his real account**, and has not yet tested "Undo this whole import" on it. No data-integrity incident; just real usage, and a reminder that this account now holds real import data pending an undo test.

**"Undo this whole import" button — three separate real bugs, found and fixed in sequence, only the third was the actual blocker:**

1. **(build 2026-07-01b)** Several import-screen Alpine bindings (`importPreview.plants.length`, `importPreview.skipped`, `importViewBatch.id` ×2) were read without a null guard in `x-text`/`x-if` expressions, throwing `TypeError`s on every page load before the importer was ever opened. Fixed with `importPreview &&` / `importViewBatch &&` guards. Confirmed those specific errors gone after fix — **but the button still didn't respond to clicks.**

2. **(build 2026-07-01c)** Scanned every `x-text`/`x-show`/`:disabled`/`x-model`/`:class`/`@click` attribute on the live page by running each through `new Function(...)`. Found 5 directives (the species Rename/Delete buttons' `@click`/`x-model`, and the species-field `:class`/`x-text`) using **typographic curly quotes (‘ ’) as JS string delimiters** instead of straight quotes — e.g. `startRename(‘species’)`. Not valid JavaScript at all; threw a `SyntaxError` on every DOM walk (page load, and every time an `x-if` template got freshly inserted). Fixed by swapping to straight quotes. Confirmed zero broken directives afterward — **button still stuck disabled.**

3. **(build 2026-07-01d, the actual root cause)** Isolated the button's `:disabled` binding directly and discovered a real quirk in this app's bundled Alpine build: `:disabled` bound to an **empty string `""`** is treated as `disabled=true` — only a literal boolean `false` counts as enabled. Confirmed with a scratch Alpine component: `:disabled="false"` → enabled, `:disabled="''"` → disabled, every time. `importBatchBusy` is a string sentinel (empty when idle, holds the busy batch's id while an undo runs) — not a boolean — so the three `:disabled="importBatchBusy"` bindings (batch-list row, single-batch drill-down, duplicate pick-step list) were stuck disabled from first render, regardless of the actual (falsy) value. Fixed with `:disabled="!!importBatchBusy"` on all three. **Durable lesson for this codebase: any future `:disabled` binding must use a real boolean, never a string/id sentinel directly** — every other `:disabled` target in the app already does (detailBusy, saving, photoBusy, etc.), which is why only these three were affected.

**VERIFIED LIVE (build 2026-07-01d):** on Stephen's real account, clicked "Undo this whole import" on the actual CP DB2.xlsx batch (151 plants) — correctly flipped to "Delete all 151 plants from this import? Yes/No". Clicked **No** to back out; data untouched. Stephen has not yet run the actual undo (Yes) — his call, whenever he wants to.

**FOLLOW-UP — real undo run for real (2026-07-01, later same day):** Stephen reports he had imported CP DB2.xlsx **twice** (a second real run created a second, separate import batch — expected behavior, since imports never merge/dedupe by design) and used "Undo this whole import" (the actual Yes, not a dry-run) to delete **both** batches. Confirmed working correctly at real scale, on real data, across two independent batches. **Account-state correction:** the 166-plants/"CP DB2 fully intact" figure recorded above is now stale — his real account is back down to whatever it held before either CP DB2 import (Stephen's own base collection, roughly ~15 plants). Don't cite the 166 figure as current state going forward.

---

## 2026-06-30 — Country field (migration 009) + Type → Categories import (build 2026-06-30d)

**Country field:** `plant.country` text column (nullable, no FK, no RLS change — lite tier). Added to add/edit form with datalist autocomplete from existing values, detail hero with globe SVG icon, gallery filter pills (drives `generaGallery()` and `genusPlants()`), import mapper (auto-detect: `^country$|^nation$|^country of origin$`), CSV export. Import auto-detect fixed: `country` regex now separate from and checked before `locationData` (prior collision silently dropped whichever column won the race).

**Type → Categories import (no migration):** A mapped "Type" column (e.g. Plant / Seed / Cutting / TC) is now imported as a category tag on each plant — free-form, not an enum. Auto-detect maps `^type$|^plant type$` to the new `typeCategory` import slot; the old `acquisitionType` auto-detect no longer claims bare `^type$`. During `runImport`: new category names are upserted first, then the bulk plant insert uses `.select('id')` to collect IDs, and `plant_category` rows are bulk-inserted afterwards. Summary pills show "N new categories" in preview and result screens. Previously unrecognised "how acquired" values now generate a warning row instead of silently dropping.

**Verified:** Country field end-to-end in Chrome — added *Pinguicula gigantea* with country "Mexico", confirmed globe icon in detail hero, "Mexico" filter pill appeared in gallery, click filtered to 1 genus. Type axis: static structure verified via grep; live import test pending with Stephen's real file.

---

## 2026-06-30 — Multi-pest picker on pest_treated events (migration 008) (Full tier)

Upgraded pest selection from a single dropdown to **tappable chips** (pick Thrips AND Mealybugs in one event). Migration 008 replaces `journal_entry.pest_id` FK with a `journal_entry_pest` junction table, mirroring the proven `plant_category` pattern. Build `2026-06-30b`.

**Architecture (Opus 4.8):** junction table chosen over `pest_ids[]` array specifically to avoid deletion rot — cascading FK on both ends, no orphaned IDs. Old `pest_id` column dropped in the same migration (no leftover schema). Security tier: Full — cross-tenant FK guards on both ends of the junction (`app_owns_journal_entry` + new `app_owns_pest`). Backfill carries `user_id` from source row (runs as postgres where `auth.uid()=null`).

**Build (Sonnet 4.6):** chips in all three editors (per-plant Log, focused sheet, quick-log). Side-query pest load (never nested in the core event SELECT — journal survives a missing table). `syncPests` delete-then-insert mirrors `syncCategories`. Timeline displays pests comma-joined ("Thrips, Mealybugs · Spinosad · 2 ml/L"). `syncPests` errors propagate to outer handlers (Security finding: don't swallow errors silently).

**Separated Security agent verdict: PASS.** One LOW finding applied: removed `catch(_){}` from `syncPests` so a partial failure surfaces to the user rather than silently wiping pest links.

**Verified END-TO-END:** Chrome (`test@test.com`, build `b`) — two-pest event saved to `journal_entry_pest`, loaded back via side query, timeline showed "Thrips, Mealybugs". Account cleaned. **Stephen's iPhone (WebKit) — PASS** ("Looks good").

---

## 2026-06-30 — Import blank-status fix (build 2026-06-30a)

Blank status cells in a mapped Status column were silently shown as "In collection" in the import preview. Now shown as **— blank —** in amber; blank rows counted in the "to review" total. DB still stores `in_collection` (schema requires NOT NULL); making `lifecycle_status` nullable is a future migration. Verified live in Chrome via Alpine `$data` simulation.

---

## 2026-06-29 — Import test on `CP DB2.xlsx`: SHIPPED feature confirmed live; two new findings deferred

Ran the spreadsheet importer (built 2026-06-23) against Stephen's real, messiest legacy file for the
first time, on the `test@test.com` account (Chrome, Claude-in-Chrome driving). **Result: the shipped
feature works correctly end-to-end on real data.** Mapped Plants tab (214 rows) → 151 plants created,
5 genera, 133 species, 53 vendors, 4 rows flagged for review (messy Status values). Spot-checked one
imported plant (Byblis gigantea) against the source row — vendor, date (Excel-serial converted
correctly), price, accession ID (Key column), and notes all matched exactly.

**Bug confirmed for the backlog:** blank Status cells (174/213 rows in this file) silently default to
`in_collection` instead of staying blank or showing a "was blank" marker. Stephen's ask, logged in the
`ui-polish-backlog` memory (#5) — fix in both the import preview and the default-status logic.

**Two new findings from reading the file's other tabs (Images, Journal) — not part of this session's
build, captured for later:**
1. **5 real Journal entries** exist in the file (dated notes + event types like Repot/Observation),
   small enough to recover by hand or a future targeted import.
2. **20 real photos** exist, but only as Google-Drive filename references (AppSheet stored the actual
   files in a Drive folder `Images_Images/...`) — recoverable, not yet pulled in. Prompted a sync
   question (could app-added photos push BACK to Drive, two-way?) — answered and logged as a future,
   not-yet-scoped full-tier item in the `import-sync-design` memory (new "Photo round-trip to Google
   Drive" subsection): technically possible, but it's the heaviest piece of the sync roadmap (write
   OAuth + dual-upload + new conflict edges), not something to build before the app is in daily use.

Full tab-by-tab read (Plants/Species/Images/Journal/Genus/per-genus tabs/Sheet11) captured in the
`legacy-data-findings` memory. Account left with the 151 imported test plants in place (not undone)
pending Stephen's further review — **import undo is available** (one click in the app) if needed.

---

## 2026-06-27 — iOS keyboard layout bug fixed (builds c–g)

After Chrome verified (build b), Stephen tested on iPhone (Safari/WebKit). Found: the iOS origin
badge (`stephend7.github.io`) and keyboard layout caused the panel to be unusable. Fixed across
five builds:

- **c**: Moved species panel from inside the form to app root (alongside other sheets), so iOS
  stops treating the search input as a form field. Added `autocorrect/autocomplete/autocapitalize=off`.
- **d**: Added `visualViewport.resize` listener + `padding-bottom` on `.sheet-back` equal to keyboard
  height. This is the key iOS layout fix: `position:fixed;inset:0` anchors to the LAYOUT viewport
  (behind keyboard); `padding-bottom` shrinks the flex content area so the sheet floats above the
  keyboard instead.
- **e/f**: Moved the `＋ New` (create species) button to the PANEL HEADER — well above where the iOS
  system origin badge floats. Badge appears at the top edge of the keyboard stack and overlaid the
  old in-list Create row regardless of position within the search bar.
- **g**: Removed auto-focus on panel open. Without keyboard focus, no keyboard, no badge — user sees
  the full species list (including long hybrid names) immediately. Badge only appears if user
  deliberately taps the search bar to type/search. Added `padding-bottom:60px` on the list body as
  a secondary buffer so the lowest row stays clear of the badge zone when keyboard is visible.

**Final verified state (Stephen's iPhone, build g):**
- Panel opens badge-free, full list visible, long hybrid names readable ✓
- Tap a species → picks immediately, no keyboard needed ✓
- Tap search bar → keyboard + badge appears; ＋ New in header stays visible above badge ✓
- Tap ＋ New with search text → creates species ✓

---

## 2026-06-27 — Species search-panel picker BUILT (builds a + b)

Replaces the native species `<select>` and the crowded ＋New / ✎Rename / 🗑Delete button row with a
**tappable field** + **search-panel overlay**. Solves Fix #1 (button crowding) and the hand-entry
UX problem in one change. Lite tier — no migration, no new RLS surface; `spCreate()` is a direct
mirror of the original `confirmAdd('species')` insert path (owner-scoped, same FK + constraint
coverage). Build **2026-06-27a** (feature) + **2026-06-27b** (spEditMode reset on delete).
Commits: `cc1238c`, `b1b7c8f`.

**What was built:**
- Species field → full-width `<button class="sp-field">` showing selected name (italic) or a prompt
  ("— choose species —" / "pick a genus first") — both driven by `speciesName()` + Alpine `:class`.
- Tapping opens a `sheet-back` overlay (same CSS + z-index pattern as all other sheets, z-index:65
  to clear the quick-log sheet at 60). Genus name shown as panel title scope context.
- **Autofocused search input** (`$refs.spSearchInput`, `setTimeout` yield per playbook rule).
- **`spFilteredSpecies()`** — substring filter over `speciesOptions()` (genus-scoped + last-picked-
  first ordering preserved); empty query = full ordered list.
- **`＋ Create "..."` row** appears when `spSearch.trim()` is non-empty and `!spHasExactMatch()`.
  Tapping calls `spCreate()` → owner-scoped insert → pushes to `speciesAll`, sets `form.speciesId`,
  closes panel. Exact-match guard prevents accidental duplicates.
- **"✎ Edit this species" link** (visible only when species selected + `!spEditMode`) → toggles
  `spEditMode` to reveal Rename + Delete buttons in an inline box. "Done" button collapses it.
  Rename/Delete reuse **existing `startRename` / `confirmRename` / `askDeleteSpecies` /
  `confirmDeleteSpecies`** functions unchanged — no new CRUD logic.
- `onGenusChange`, `resetForm`, `editPlant` all reset `spPanel / spSearch / spEditMode`.
- `confirmDeleteSpecies` now also resets `spEditMode` (build b fix: edit section was lingering
  with no species selected after delete).
- **`applyDetection` and `applyTagScan` unaffected** — they set `form.speciesId` directly after
  pushing the new species to `speciesAll`; the tappable field reads `speciesName(form.speciesId)`
  reactively, so the scan pre-fill just appears in the field without opening the panel (the panel
  is the manual/correction path). The `await new Promise(r=>setTimeout(r))` yield kept as-is.

**Verified Chrome END-TO-END** (`test@test.com`, build `b`):
- Field renders as button (no old `<select>` in DOM) ✓
- Panel opens on tap, shows 4 Pinguicula species ✓
- Filter "spat" → 0 matches + ＋ Create "spat" row (no false Pinguicula match) ✓
- Tap "gigantea" → panel closes, `speciesId` set, field shows "gigantea", Edit link appears ✓
- Open panel → type "test-picker-sp" (no match) → Create → species in DB + `speciesAll`, field
  shows name, panel closed ✓
- Edit → Delete → Confirm → species removed from DB + `speciesAll`, field resets to "— choose
  species —", `spEditMode` resets to false ✓

**Still needs Stephen's iPhone pass (WebKit gate per Conditions for Builder):** keyboard raise +
panel scroll, focus behavior, tap-target comfort, iOS-specific rendering. Chrome = Blink only.

---

## 2026-06-26 — PLAN: searchable species picker (replaces the species dropdown + button row)

> Architecture locked on **Opus 4.8**; **build on Sonnet 4.6**. Stephen approved the direction
> 2026-06-26. **Not built yet.**

**Decision.** Replace the native species `<select>` and its crowded ＋New / ✎Rename / 🗑Delete button
row with a **search-panel picker**. Solves two issues at once: (a) the tabled Fix #1 — three buttons
crowd out the (often long, hybrid) species name, truncating it to "martin…"; (b) the on-device finding —
a native dropdown is unusable for a long, growing species list with no type-to-filter, especially for
**hand entry or when the tag-reader misses the species**. Chose a **focused search panel/sheet** over an
inline dropdown for **iOS reliability** + finger-friendliness on big lists. Genus stays as-is for now
(shorter list); the same picker can follow if Stephen likes it.

**Design.**
- The species field on the add/edit form becomes a **tappable field** showing the selected species (or
  "— choose species —" / "pick a genus first"). Full-width. The ＋New / Rename / Delete buttons leave the
  row.
- Tapping opens a **search panel** (reuse the app's existing focused-sheet/overlay pattern — already
  iOS-tested):
  - Shows the current genus as scope context.
  - Autofocused search input; **case-insensitive SUBSTRING** match over the species name (matches
    anywhere → "lau" finds "martinezii × laueana").
  - Scrollable filtered list; empty-query order = existing `speciesOptions()` (last-picked
    `lastSpeciesId` pinned, then alphabetical).
  - No exact (case-insensitive) match for the typed text → a **"＋ Create species '<typed>'"** row →
    creates under the current genus + selects. **This replaces the ＋New button.**
  - Tap a row → sets `form.speciesId`, closes the panel.
- Below the field: a small **"✎ Edit this species"** link (only when a species is selected) → reveals the
  EXISTING inline Rename + Delete UI (Delete red, inside), incl. the in-use guard ("N plants use this
  species — rename it instead").

**Conditions for Builder (Sonnet 4.6):**
1. **iPhone is the gate.** Custom picker → verify on Stephen's iPhone (keyboard, panel scroll, focus, tap
   targets), not just Chrome. Reuse the existing `.sheet`/quick-log overlay markup; avoid fragile absolute
   positioning. Heed prior iOS bugs: stacking context from `-webkit-overflow-scrolling`, and native-select
   render races → use the macrotask yield `await new Promise(r=>setTimeout(r))`, not `$nextTick`.
2. **Reuse existing CRUD — do not reinvent:** Create → existing species-insert path (`confirmAdd('species')`
   ~L2068: insert `species` {name, genus_id}, push `speciesAll`, set `form.speciesId`); preserve naming
   rules (× hybrids, 'cultivars', sp.) + genus scope + in-memory sync. Rename/Delete → existing
   `startRename('species')` / `confirmRename` / `askDeleteSpecies` / `confirmDeleteSpecies` /
   `cancelDeleteSpecies` + inline boxes + in-use block; just re-home behind the Edit link. Selection sets
   `form.speciesId` (same binding the `<select>` used).
3. **Ordering** = reuse `speciesOptions()` (last-picked pinned, then alphabetical) for the empty-query list.
4. **Genus scope** = list only species for `form.genusId`; keep the "pick a genus first" guard; field not
   usable until a genus is chosen.
5. **Don't break tag-scan pre-fill** (`applyDetection`): a scanned species must show in the field without
   forcing the panel — the panel is the manual/correction path.
6. **onGenusChange** already clears species + cancels rename/delete — keep it.
7. **Tier: Lite.** No new DB/RLS/import/egress surface (UI re-shell over existing owner-scoped species
   CRUD). **No migration.** Security review = confirm create/rename/delete still use the same owner-scoped
   paths. One build, bump `<meta app-build>`, verify (Chrome + iPhone), one commit.

**Edge cases:** empty genus (field prompts for genus, not tappable); long hybrid names (ellipsis in field,
graceful wrap/truncate in rows); duplicate-name create (existing guard / DB unique); a confirmed rename must
update the field's displayed name (rename already patches `speciesAll` + loaded rows).

---

## 2026-06-26 — Journal improvements: tab search/filter + per-photo "keep out of gallery" toggle

Two requests in one (Stephen at work, wanted low-decision work he could just approve).

**(A) Journal tab search + event-type filter (Lite, no migration).** The Journal "All" feed gets a
search box (matches plant name, note body, event-type label, and the product/pest line) and an
event-type dropdown listing only the types actually present. `filteredEvents()` drives the list;
"No entries match" shows when empty. Pure client-side filter over already-loaded `allEvents` — no new
query/write surface. Build `…c`. Committed + pushed (3f63abf). **Verified live** (Chrome,
`test@test.com`): search "weekly" → the fed note; type=fed → 1; search "drosera" → all 3 (plant-name
match); dropdown lists acquired/fed/note only.

**(B) Per-photo "journal only" toggle (migration 007).** Stephen: a journal entry may include an ugly
documentation photo he wants visible ONLY in the journal entry, not in the plant's main gallery. New
`photo.in_gallery boolean default true` (migration 007). `galleryPhotos()` filters out journal photos
(`journal_entry_id` set) with `in_gallery=false` from the detail strip + "See all" page; `loadAllPhotos`
excludes them server-side (`.neq('in_gallery',false)`) from the collection Photos grid; a journal photo
always still shows inside its journal entry (`eventPhotos` ignores the flag). A **"Hide from plant
photos" / "Show in plant photos"** toggle lives in the full-screen viewer, shown only for journal photos.
Default true = current behaviour preserved. Build `c → 2026-06-26d`. **Held the push until Stephen ran
007** (in_gallery is in the core photo select → would break photo load otherwise), pre-flighted the
column, then pushed (aafb01c).

**Verified live END-TO-END** (Chrome, `test@test.com`, build `d`, on a throwaway plant with a created
journal photo): default → photo in BOTH gallery and journal; **Hide** (real viewer button) → leaves
`galleryPhotos()` but stays in `eventPhotos()`, label flips to "Show…"; **Show** → back in the gallery;
**fresh DB re-read confirmed the hidden state persists**. Throwaway plant deleted (cascade removed its
event + photo + storage); account at baseline. **Lite security:** `in_gallery` is a plain column on the
user's own RLS-scoped photo rows; toggle is an owner-scoped update; no new surface.

**Backlog now:** Fix #1 (species-row buttons) still **tabled** for Stephen (Option A mockup'd). Plus
species #5c merge, Settings tab, inventory mode, Care/Insights, Lists & sharing, and the standing
import on-device pass.

---

## 2026-06-26 — Fixes round (Stephen on-device). Fix #2: restore the detail-page info-tile boxes

Stephen is gathering a list of UI fixes (handled one at a time). **Fix #1** (the species row's
＋New/Rename/Delete buttons crowd out the name — long hybrids truncate to "martin…") was **tabled**
for him to think about; I mocked up the recommended "Option A" (full-width dropdown + ＋New, with
Rename/Delete behind a small "Edit this species" link; Delete inside that panel, in red). Decision
pending.

**Fix #2 (DONE + verified):** the Quantity/Status/Growing-spot boxes had flattened to plain text — a
**regression from the tap-to-edit tiles change**. Root cause: each tile carried a static `style`
(box bg/border/radius) AND a dynamic `:style` for the tap highlight, and Alpine's `:style` clobbered
the static box style. Fix: moved the box look into a **`.itile` CSS class** and switched the highlight
to a class toggle (**`.itile.sel`**), removing the inline `style`/`:style` conflict (build `…z →
2026-06-26a`). **Second bug caught in live verification:** the muted "Not set" value used class
`empty`, which collided with the global `.empty` empty-state rule (dashed box + 30px padding + 34px
margin) → tall, boxed text, and `align-items:stretch` stretched all three tiles. Renamed the class to
`.unset` (build `a → 2026-06-26b`). Committed + pushed (e0137ee, 7675e13).

**Verified live** (Chrome, `test@test.com`, build `2026-06-26b`): tiles render as 3 uniform 55px boxes
with bg/border/10px radius, "Not set" muted with no dashed border; tap-to-edit still opens the editor,
the `.sel` highlight applies on the active tile and clears on cancel. No data touched. Lesson: **don't
mix a static `style` with a dynamic `:style` on the same element** (Alpine clobbers it — use a class),
and **avoid bare utility class names** like `empty` that collide with global rules.

**Build-marker note:** the `2026-06-23x/y/z` run hit the end of the alphabet; rolled to `2026-06-26a/b`.

---

## 2026-06-24 — Pest picker on pest_treated events (migration 006) (Lite)

From [[ui-polish-backlog]] #1. A per-user **pest / disease reference list** + a **single-select pest
picker** that shows ONLY on `pest_treated` events, in all three editors (per-plant Log, focused sheet,
Journal quick-log) — mirroring the existing fertilizer/pesticide **product** feature. Separate from the
product field: product = *what you sprayed* (Spinosad), pest = *what you treated* (thrips). Seeded with
8 common CP pests (Aphids, Botrytis, Fungus gnats, Mealybugs, Scale, Slugs & snails, Spider mites,
Thrips). Timeline line now reads **"pest · product · dose"**. **Single pest per event for now** — chose
the lean mirror-of-product over a multi-pest many-to-many to fit the session; multi is a later
extension.

- **Migration 006** (`app/migrations/006_pest_reference_and_journal_pest.sql`): new `pest` table
  (RLS owner-only) + nullable `journal_entry.pest_id` (FK, on delete set null). `pest_id` is a plain FK
  matching the `product_id` precedent — no app_owns guard (self-only opaque ref; reads are user_id-scoped).
- **Build/deploy ordering mattered:** `pest_id` is referenced in the CORE event select/save (not an
  isolated modal), so deploying before the migration would break journal load/save. **Held the push
  until Stephen ran 006**, pre-flighted the live DB (pest table + pest_id column present, no error),
  THEN pushed build `z`. Committed + pushed (3a76661).
- **Lite security:** pest table RLS owner-only; pest_id no new read path (resolved against the user's own
  `this.pests`); `＋ New` insert passes `user_id` explicitly (mirrors `confirmAddProduct`).

**Verified live END-TO-END** (Chrome, `test@test.com`, build `z`): 8 pests **seeded** on first load;
logging a `pest_treated` event with **Thrips + Spinosad + "2 ml/L"** saved `pest_id` and rendered the
timeline as **"Thrips · Spinosad · 2 ml/L"**; **＋ New "Root mealybugs"** created + auto-selected; the
**edit round-trip** reloads the event's pest; **reload confirmed DB persistence**. Test event + the ＋New
test pest deleted (8 seeded pests kept; the 3 remaining Drosera events are pre-existing test data from
2026-06-21/22, not this session's). Inline JS parse-checked in JavaScriptCore.

**Backlog now:** species **#5c merge** (optional); Journal-tab search/filter/grouping; Settings tab
(currency); lightweight inventory mode; Care/Insights analytics; the bigger Lists & sharing phase. Plus
the standing **import on-device pass** (Stephen's 3 real `.xlsx` + iPhone/Safari). NEXT = Stephen's pick.

---

## 2026-06-24 — Tap-to-edit info tiles (Quantity / Status / Growing spot) (Lite)

Next item after the species trio. The three detail-page info tiles became **tappable** (faint ✎ on
each) → an inline editor drops below the tile row with Save/Cancel:
- **Quantity** → number → `plant.quantity`.
- **Status** → picker; **Dead** reveals a cause field; saving writes the status AND **logs the dated
  journal event** (died/sold/traded/given_away, or a "Returned to collection" note) with the cause.
- **Growing spot** → pick existing or **＋ New** (inline add) → `plant.growing_location_id`.

**Key safety decision (addresses Stephen's "could this create a bigger problem?"):** the status →
journal-event logic was **extracted into ONE shared helper `logStatusChange(id,old,new,cause)`** used by
*both* `savePlant`'s Edit path and the new Status tile. The status→event-type map now exists **exactly
once** (verified), so the quick tile edit and the full Edit form can never drift — no risk of a status
change that silently skips its history event or cause-of-death. Considered bundling this with #5b;
deliberately kept it a **separate change** (different surface = detail page; Status carries real logic).

Build `x → y`, committed + pushed (db01aa0). **Lite security:** every tile writes via an RLS-scoped
`plant` update on the owner's row; the status event reuses the RLS-guarded `logEvent`; `＋ New` location
inserts a `growing_location` (RLS owner). No new surface.

**Verified live END-TO-END** (Chrome, `test@test.com`, build `y`, on a throwaway plant): real tile
clicks open the editor and the real Save fires. **(1) Quantity** 1→3, persists. **(2) Status→Dead +
"Crown rot"** → status='dead' AND a `died` event dated today **with cause "Crown rot"** logged; list
badge updated. **(3) Status→In collection** → "Returned to collection" note logged. **(4) Growing spot
＋ New "TestShelf"** → location created, selected, saved to the plant. **(5) Regression:** changing
status via the **full Edit form** still logs (a `sold` event) — proves the shared-helper refactor didn't
break the existing path. **Reload confirmed DB persistence** (qty 3 / status sold / spot TestShelf).
Throwaway plant (+ its 4 events) and the test location deleted → account back to baseline. Inline JS
parse-checked in JavaScriptCore.

**Backlog now:** species **#5c merge** (optional) and the various Journal-tab / inventory-mode /
Settings items in [[ui-polish-backlog]] remain. NEXT = Stephen's pick.

---

## 2026-06-24 — Species cleanup: delete an unused species (#5b) (Lite)

Follow-on to #5a rename, chosen by Stephen ("finish the species story"). A red **🗑 Delete** button
next to ✎ Rename (shown when a species is selected). Deliberately **safe-by-construction**:
- **In use → refused**, with a count: "N plants use this species — rename it instead" (singular/plural
  agreement). No delete.
- **Unused → inline confirm** ("Delete this species? Can't be undone. [Delete] [Cancel]") → removes the
  one species row (its care fields + cascaded `care_guide_entry` go with it) and clears the selection.
- **Two backstops:** the client in-use count (over `plant.species_id`) AND the DB's
  `plant.species_id … on delete restrict` — the latter caught and shown gently if a plant wasn't
  loaded. RLS scopes the delete to the owner's species. Lite — no new surface.

Considered bundling the **tap-to-edit info tiles** in; deliberately kept separate (different surface =
detail page; the Status tile carries real event-log + cause-of-death logic that deserves its own pass).

Build `v → w`; then `w → x` for a grammar fix caught in verification ("1 plant **uses**", not "use").
Committed + pushed (4b3cacc, e96878d).

**Verified live END-TO-END** (Chrome, `test@test.com`, build `w`): **(A) in-use blocked** — selecting
*Drosera spatulata* (used by the one plant) → Delete → "1 plant uses this species — rename it instead",
not deleted; **(B) unused deleted** — created a throwaway species, Delete → confirm → removed from the
list + selection cleared, and a **full reload confirmed it's gone from the DB** while *spatulata*
survived and plant count stayed 1 (net-zero, account clean). The Delete button's `@click` binding fires
its handler (confirmed via a real DOM click; synthetic-mouse misses were an automation coordinate quirk).
Inline JS parse-checked in JavaScriptCore.

**Species trio status:** **#5a rename** ✅ + **#5b delete-unused** ✅ done & verified; **#5c merge**
remains the optional later follow-on. NEXT (Stephen's pick): **tap-to-edit info tiles** (Quantity /
Status / Growing spot) — its own change; the Status tile needs care (must log the status event +
capture cause-of-death like `savePlant` does).

---

## 2026-06-24 — Scanner/entry backlog COMPLETE: #4 verified live on device

Stephen redeployed the `scan-tag` Edge Function and re-scanned a real tag — **"#4 worked well"**: the
hybrid's trailing `#N` now stays in the species name (no longer routed to Notes). That closes the last
open item. **All five backlog items are now built AND verified live**: #1 How-Acquired default, #2 save
tag photo, #3 cross-genus blank-screen fix, #4 hybrid `#N` parsing, #5a rename species. Current build
`2026-06-23v`. Optional later follow-ons remain (not requested): **#5b** delete-unused species, **#5c**
merge species.

---

## 2026-06-24 — Scanner/entry UX (3 of 5): save the scanned tag photo with the plant (#2) (Lite)

The last build item on the five-item backlog. Stephen asked to "ask 'Save Photo with plant?'" after a
scan; built as an **inline pre-checked toggle**, not a popup, per the house rule *no blocking popups
for optional data* (architecture.md) — flagged the divergence, easy to switch.

- After a successful scan, the tag image is **held** (`scannedTagPhoto`, processed in the SAME pass
  that reads the tag — `processImage` once → full for both the Edge Function and the saved photo) and
  an inline toggle **"Keep this tag photo with the plant"** (with a thumbnail) appears under the scan
  note, pre-checked (`keepTagPhoto`).
- On Save (new-plant path only — scan is add-only), if kept, the tag photo is appended to the save
  set and stored as a **`label='tag'`** photo. **Cover prefers a non-tag (clean) shot** — a tag photo
  is for reading, not display, so it's only the cover if it's the only photo.
- Held OUTSIDE `pendingPhotos` so it doesn't clutter the photo grid or skew the "cover" badge; object
  URLs revoked on every reset/re-scan/save (`_clearScannedTagPhoto`, wired into `clearPendingPhotos`).
- **Lite security:** reuses the already-reviewed `uploadPhoto` + RLS/owner-path storage pipeline; no
  new egress (the image was already sent to scan), no new untrusted surface. PASS.

Build `u → v`, committed + pushed (687d729).

**Verified live END-TO-END** (Chrome, `test@test.com`, build `v`). file_upload can't take repo paths,
so the real `scanTag` path was driven by constructing an actual image File in-page (a canvas with
"Pinguicula gigantea" drawn on it) and passing it to `scanTag` — the **live Edge Function read it**
(filled genus+species), and the tag photo was held with full+thumb+url blobs and the toggle rendered
**pre-checked with its thumbnail** (DOM-confirmed: visible 595×42 row). Then: (a) **keep ON + a clean
photo → 2 photos saved**, the clean one `label='plant'`, the scanned one **`label='tag'`**, and the
**cover = the clean photo, not the tag**; held photo cleared after save. (b) **keep OFF → 0 photos
saved**, no cover. Asserted against live Alpine `$data`. Both test plants (incl. one with 2 stored
photos) deleted via the app's `deletePlant` (removes storage files); account back to baseline (1 plant).
Inline JS parse-checked in JavaScriptCore before push.

**Backlog status:** original five all addressed — #1 #2 #3 verified live; **#5a** verified live; **#4**
built + pushed but **pending Stephen's `scan-tag` redeploy + a real laueana-tag rescan** to verify.
Later species follow-ons remain optional: **#5b** delete-unused, **#5c** merge.

---

## 2026-06-24 — Scanner/entry UX (2 of 5): rename a species (#5a) + keep hybrid #N in the name (#4) (Lite)

The data-quality pair off the five-item backlog. Both Lite — #5a is CRUD on the user's own
RLS-scoped rows; #4 is a prompt-only change to an already-shipped function.

**#5a — Rename a species (the cleanup capability).** Stephen: "I can't edit the species once it's
in the list" → a wrong/auto-created name was permanent and piled up "bad lines", and the scanner
*auto-creates* species so misreads pollute the reference list. Because species is a real related
table (care fields + `care_guide_entry` + `plant.species_id` FK) and everything references it by
**id**, a rename fixes the name **everywhere at once** with no orphan. Added a **✎ Rename** button
next to ＋ New (shows when a species is selected) → inline box prefilled with the current name →
Save updates the one row. Generic `startRename`/`confirmRename` (species/genus/vendor/location);
only the species button is wired now. Already-loaded plant/detail rows hold joined copies, so they're
patched in memory to update immediately. Per-genus duplicate names caught with a friendly message
(the `unique(user_id, genus_id, name)` constraint). Build `t → u`, committed + pushed (a34a8c2).

**#4 — Hybrid trailing #N stays in the species name.** Real tag "P. laueana × Unknown #3" had the
`#3` routed into careNotes; it identifies the cross and is part of the written name. `scan-tag`
prompt now captures the full name remainder verbatim **including** a trailing cross/clone `#N`
(worked example in-prompt), and states such a number is NOT a care note or accession; accession/
careNotes tightened so they don't steal it. Committed + pushed (b047e09). **Prompt-only — does NOT
take effect until the `scan-tag` Edge Function is REDEPLOYED in Supabase** (git ≠ deploy for
functions).

**Verification — split, stated honestly.** **#5a VERIFIED live END-TO-END** (Chrome, `test@test.com`,
build `u`): selected Drosera→spatulata (the species the one existing plant uses), ✎ Rename opened a
box prefilled "spatulata", renamed → "spatulata RENAMED" → the species row, the genus-scoped
dropdown, the plant's joined name and `displayName` ("Drosera spatulata RENAMED") all updated, no
error; the **Save button** fires `confirmRename` (an earlier miss was an x-transition timing fluke,
re-tested clean); **renamed back to "spatulata" and a full page reload confirmed DB persistence +
clean baseline** (1 plant, species "spatulata"). Asserted against live Alpine `$data`. Inline JS
parse-checked in JavaScriptCore; `scan-tag` template literal integrity checked. **#4 NOT yet
verified — gated on Stephen redeploying `scan-tag` and re-scanning the real laueana × Unknown #3 tag**
(no API key on Claude's side to run the model).

**Remaining backlog (1 of 5 left + #4 pending verify):** **#2** save the scanned tag photo with the
plant (lean: inline "keep tag photo" toggle, attach as a `tag`-labelled NON-cover photo — pending
Stephen's popup-vs-inline call). Plus **#5b** delete-unused / **#5c** merge as later species follow-ons.

---

## 2026-06-24 — Scanner/entry UX (1 of 5): open the saved plant after add; "How Acquired" remembers last (Lite)

Two items off a five-item scanner/entry backlog Stephen gathered while testing the tag scanner
against real tag photos (the other three are listed at the bottom). Both **Lite** — no auth/RLS/
untrusted-input/egress surface, so no separate Security agent.

1. **Blank screen after a cross-genus save (the real bug).** `savePlant`'s new-plant branch ended
   at `screen='list'` and never opened the new plant, while the genus drill (`galleryGenus`) stayed
   pinned to whatever you were browsing. So saving a plant whose genus differed from the open drill
   (browsing Pinguicula, scanning/adding a Utricularia) dropped you onto a list that *can't* contain
   it → looked blank, and it never showed the plant you just made. **Fix:** after a new save, open
   the saved plant's detail (mirrors the edit branch) and retarget `galleryGenus` to the new plant's
   genus so 'back' lands on a list that includes it.

2. **"How Acquired" defaults to the last chosen value**, exactly like Genus — new
   `lastAcquisitionType` persisted in localStorage, applied in `resetForm`, saved in `rememberPicks`
   **only when non-empty** (a blank pick never wipes the standing default). Edit-an-existing-plant
   untouched (loads the plant's own type). The scanner doesn't extract acquisition type → no clobber
   conflict; it's a pure convenience default.

Build `2026-06-23s → 2026-06-23t`. Committed + pushed (35ed536).

**Verified live END-TO-END** (Chrome, `test@test.com`, build `t` confirmed in-app): reproduced the
exact bug — drilled into Drosera (`galleryGenus='Drosera'`), added **Pinguicula gigantea**, How
Acquired = Traded, Saved → landed on the new plant's **detail page** (`screen='detail'`, not blank),
`galleryGenus` retargeted to Pinguicula, count 1→2, no error; 'back' showed the Pinguicula drill
containing the new plant. Then a **fresh Add form defaulted How Acquired to "Traded"**
(`form.acquisitionType='traded'`, rendered select reads "Traded"; `lastAcquisitionType` persisted to
state + localStorage). Asserted against live Alpine `$data`, not self-report. Test plant deleted,
account back to baseline (1 plant). Inline JS parse-checked in JavaScriptCore before push.

**Remaining backlog (3 of 5, NOT yet built):** **#2** save the scanned tag photo with the plant
(lean: inline "keep tag photo" toggle, attach as a `tag`-labelled NON-cover photo — pending Stephen's
popup-vs-inline call). **#4** scanner routes a hybrid's trailing `#N` (real tag "P. laueana × Unknown
#3") into Notes instead of keeping it in the species name — narrow prompt fix + **redeploy `scan-tag`**;
note the parser already routes locality correctly (verified on the Utricularia beaugleholei tag). **#5**
can't edit a species once listed (rename / delete-unused / merge) — species is a real related table
(care fields + `care_guide_entry` + `plant.species_id` FK), so **rename** fixes a bad name everywhere
at once with no orphan line; the auto-create scanner makes this cleanup capability matter.

---

## 2026-06-24 — Import: "view a specific import's plants" drill-down (Lite)

Closed the one UX gap Stephen flagged: you could see the LIST of past imports and undo a
specific one, but not review WHAT a given import added before undoing. Now each row in
"Previous imports" is tappable → a **batch view** listing exactly that import's plants
(`viewImportBatch` loads `plant` where `import_batch_id = b.id`, RLS-scoped), with the
per-import Undo right there; tapping a plant opens its detail. Lite tier — read-only filter on
data the user already owns, no new untrusted-input or write surface; reuses
`displayName`/`openDetail`/`undoImportBatch`. Build `2026-06-23s`, committed + pushed (3dda856).
**Verified live** (Chrome, `test@test.com`): import 2 → view shows the 2 → undo-from-view returns
to the prior screen, plants 1→3→1, reference rows untouched, account left clean; screenshot
confirmed the render (status badge, dates, Back/Undo). Inline JS parse-checked in JavaScriptCore.

---

## 2026-06-23 — Spreadsheet import BUILT (full tier) + separated Security pass

Builder implemented v1 file-upload import: a SheetJS-in-a-Worker parse sandbox
(`app/lib/import-worker.js` + pinned `xlsx.full.min.js` 0.20.3), the mapping → preview → import →
undo UI and logic in `app/index.html`, and migration `005_import_batch_and_date_precision.sql`
(import_batch table + `plant.import_batch_id` + `acquisition_date_precision`, RLS fails-closed).
Build marker → `2026-06-23r`. Full plan + trap table: `docs/spreadsheet-import-plan.md`.

**Separated Security agent (reviewer ≠ author) verdict: SHIP-WITH-FIXES.** Held sound: Worker
isolation, no-write-before-confirm (`buildImportPreview` has no DB calls), prototype safety (Maps +
array-of-rules), XSS (`x-text`), migration-005 RLS. **Three fixes applied + re-verified in
JavaScriptCore:** (1) **CSV/formula-injection on the existing `exportCsv`** — now that untrusted
imported data can flow back out, `esc` prefixes `'` to cells starting `=+-@\t\r` (9/9 payloads
defanged); (2) **clamped-range materialization** so a hostile `!ref` can't OOM the worker (residual
zip-bomb is *contained by Worker isolation*, documented honestly); (3) per-chunk `plant_count` so a
partial-failure undo confirm is accurate.

**Verification DONE — committed, pushed (build `2026-06-23r`), and VERIFIED END-TO-END on the live
deployed app** (Chrome, `test@test.com`). Deterministic core + export fix executed in JavaScriptCore.
Then on the live app: parse pipeline (CSV + real `.xlsx` zip path + multi-tab picker), combined &
split shapes, all transforms (accession peel from an in-cell comma, partial-date precision, price
scrape, status mapping incl. `quarantine`→notes, wishlist skip, hybrid verbatim). After Stephen
applied migration 005: **real DB import + undo, counts reconcile 1→4→1** — 3 identical rows made 3
plant instances (never-merge), no new reference rows (reused existing), undo removed only the batch's
plants and left refs intact; test account back to baseline (clean). **Remaining (low):** Stephen's
iPhone/Safari pass (Chrome=Blink) + loading his three real files when ready. Feature is SHIPPED.

---

## 2026-06-23 — Import & sync: design steer from Stephen (pre-build)

Architect read the brain + ground-truthed all three real `.xlsx` files; Stephen then told the
story in his own words. Plan lives in `docs/spreadsheet-import-plan.md`. Decisions captured:

1. **Sync's PURPOSE is data-durability, not convenience.** Stephen's deepest fear is "the app
   disappears and I lose a decade of data" — the exact reason he used AppSheet (Google-Sheets-
   backed = portable to any DB). So keeping the spreadsheet in step is an **insurance promise**,
   not a feature nicety. "Eventually"-consistent is the bar (no real-time needed). Ties to
   [[platform-risk-concern]] and the architecture's day-one "Sheets sync + CSV export" pledge.

2. **Two export-back shapes, because "don't lose anything" differs per person.** (a) Write back
   into *the shape they designed* (their familiar single sheet); (b) export to *multiple
   tabs/sheets from which a relational DB could be rebuilt*. Both are backups, different audiences.
   Photos are the acknowledged hard gap — a spreadsheet backup can't hold the image files
   (the very thing that makes the app worth leaving the spreadsheet for; see #4).

3. **Don't replicate multiple lists — TAG the plant.** Collectors keep collection / trade / sale
   / wish as separate lists today, but in the app these are AXES on a plant
   (`offer_status` + Phase-3 lists), not parallel tables. Implication for IMPORT: the importer
   must ingest *multiple* lists and fold them onto those axes — "import my trade list" marks
   those plants for-trade; a single sheet with a trade/for-sale COLUMN maps that column to the
   axis. Full multi-list import is a later increment; v1 builds the mapping core that enables it.

4. **The photo-journal-tied-to-the-plant is the wedge.** The #1 thing spreadsheet users say they
   CAN'T do. It's why someone tolerates leaving a spreadsheet they love. Protect it as the headline
   value; it's also why photos can't round-trip to the sheet backup (the honest gap in #2).

5. **One feature family, build the shared back half once.** Mapping → preview → reconcile is
   identical whether rows come from an uploaded file, a published-sheet URL, or a connected
   account. Order: (1) **file upload** now → (2) **published-sheet URL read** (no OAuth) →
   (3) account OAuth → (4) true two-way sync. Nothing built for upload is wasted later.

6. **Import batch + undo (rollback safety net).** Every import run records an `import_batch`
   (`started_at` + source filename); every plant created points back to it (`plant.import_batch_id`,
   migration 005). The user can review a batch, delete individual rows, or **undo the whole batch**.
   Deliberate semantics: undo deletes the batch's *plants only* (reference rows kept — they may be
   used by hand-entered plants; `plant.species_id … on delete restrict` guards this); FK is
   `on delete set null` (deleting the batch record never silently cascades to plants); the undo
   action deletes plant rows with a **counted confirm**. Side benefit: `import_batch_id = null`
   distinguishes hand-entered from imported plants. New table → Security reviews it (full tier).

7. **A Plant is a lineage/provenance, not a tally of look-alikes.** Captured in architecture.md
   (2026-06-23). Two same-species rows (different sources) stay separate; quantity counts
   propagation within a lineage. Import NEVER merges plant rows by genus+species (reference rows
   still de-dupe). This settles **Open Q1: always create plant rows.**

8. **Pre-mortem traps + three handling principles** (full table in the plan doc, "Import traps the
   preview must catch"). Principles: (a) **errors block a row, warnings never do** — fuzzy dates /
   scraped prices / low-confidence splits are accept-in-bulk, not mandatory fixes; (b)
   **deterministic-first, AI only as optional assist**, and prefer AI on DISTINCT-VALUE sets
   (status vocab, vendor clusters — cheap) over per-row calls (costly/slow/privacy); (c) **nothing
   silent** — every guess/skip/transform shows in the preview. Specific rulings from Stephen:
   - **Dates:** partial → 1st-of-month + precision marker; ambiguous never guessed silently.
   - **Accession codes are private formats** (`S-06062026-al-01`): store VERBATIM, never parse,
     and **never mine the embedded date into acquisition_date** (date detection is scoped to the
     mapped date column only). The `-01/-02/-03` suffix is the lineage/division signal — preserved.
   - **`$` in a name** → scrape to price only if price empty, shown as a guess; bail on ranges.
   - **`Type=Seed`** → `acquisition_type='seed'` (existing enum value; no schema change).
   - **Free-text source that's prose** (Giane's `Origin`) → mappable to notes, not vendor.

9. **Prerequisites for import (sequenced).** Only ONE thing truly blocks importing *Stephen's*
   data: a **status-mapping step** (distinct source statuses → lifecycle enum | keyword/tag |
   notes; unknowns kept in notes + default `in_collection`) — and its minimal form needs **no
   schema change** beyond the `import_batch` table (005). Deferred without data loss: **wishlist
   rows** (v1 flags + SKIPS them; real non-owned holding state is a lists-phase feature);
   **`common_name` + nullable `plant.species_id`** (migration 006 — fast-follow; needed before
   *other people's* messy/common-name sheets, not Stephen's clean files; resolves the "don't be a
   plant snob" gap); **AI assist passes**; **stable sync-ID column** (write a per-plant id INTO the
   sheet so re-import matches on it — row number is unsafe because sheets get re-sorted, per
   Stephen; design now, wire up with the sync increment).

10. **Three decisions LOCKED by Stephen (2026-06-23).** (a) Parser = **SheetJS in a Web Worker**,
    upload the file directly (no CSV-export step). (b) Partial dates → **1st-of-month + a new
    `plant.acquisition_date_precision` column** (`day`/`month`/`year`) — stored date sorts right,
    marker keeps display honest and stops date-aware features assuming an unknown day; this column
    joins the pre-import model migration. (c) Accession codes stored **verbatim**.

**Security tier unchanged: FULL.** Untrusted-file parse → still spawn a REAL separate Security
agent against the *Conditions for Builder* in the plan doc (Web-Worker sandbox, hard caps,
formula/proto/XSS inertness, no-write-before-confirm). Open questions remaining before code:
re-import dedup policy (Q1), friend's `,BE-3390` → accession vs notes (Q3), status-from-tabs (Q4).

---

## 2026-06-23 — Session close: tag scanner shipped+verified; NEXT = spreadsheet import

Tag scanner is **live on build `2026-06-22q`** and confirmed working on a real handwritten tag.
The four entries below (2026-06-22/23) cover it end to end: built (full-tier, separated Security
pass), the two real-use bugs (genus/species guard; native-`<select>` render race), and the
`$nextTick → setTimeout` robustness fix, applied to both `applyTagScan` and the filename/EXIF
`applyDetection`.

**NEXT FEATURE (new session): spreadsheet import — FULL TIER.** Untrusted-file import → per the
dev method, **spawn a real separate Security agent** (don't inline-review). Architect should read,
in order: `architecture.md` (Phase 1 "spreadsheet import with field-mapping"), the
`legacy-data-findings` memory (his two sheets + friend's sheet; **field-mapping UI is essential** —
single combined name column vs split genus/species, parse via the `plant-naming-rules` memory;
`Sheet11` = 133-species seed list to de-dupe; `Source` tab = vendor seed), and `schema.sql`. The
three real `.xlsx` files live in the repo root (gitignored). **Small loose ends:** clean throwaway
test data on `test@test.com`; `scan-tag` has no per-user rate limit (accepted MVP risk).

---

## 2026-06-22 — Tag scanner bugfix: species (and genus) silently dropped on scan

**Found in real use by Stephen** (deployed build `m`): a scan filled notes/price/vendor but left
species blank and quietly kept the old genus. **Root cause:** `applyTagScan` gated the entire
genus+species block on `if(r.genus && !this.form.genusId)`, but `resetForm` pre-fills
`form.genusId` with `lastGenusId` (last-picked genus, for fast manual entry). So for any returning
user `form.genusId` is already set → the guard is false → genus AND species are skipped; the
other fields (separate lines) still fill. Stephen's guess "maybe it can't create the species" was
half right — it never *reached* the create-species code.

- **Verified live via Chrome + javascript_tool** (test@test.com): with genus pre-set to Drosera,
  feeding `{genus:'Pinguicula',species:'gigantea',…}` left genus=Drosera, species='' (bug
  reproduced). Clearing the genus first and re-running the *same* handler created+selected
  Pinguicula → gigantea, correctly scoped (create path is fine).
- **Fix:** drop the `!this.form.genusId` condition → `if(r.genus)`. A tag scan is an *explicit*
  "read this label" action, so it OVERRIDES the convenience default; confirm-don't-clobber still
  holds for fields the user actually typed. One-line change in `app/index.html`; build `m → n`.
- **Note for follow-up:** the filename/EXIF `applyDetection` has the *same* `!this.form.genusId`
  guard — likely the same latent issue when adding a photo with a returning user. Left unchanged
  (separate, noisier signal); flagged to Stephen to decide whether to apply the same fix.
  **→ DONE (build `o → p`):** Stephen asked to apply it. Two guards were blocking it: the *caller*
  (`onPhotoFiles`) only ran detection when `!form.genusId || (first && !acquisitionDate)` — both
  false for a returning user (genus pre-filled, date defaults to today) — and the inner
  `!this.form.genusId`. Fix: caller now runs detection on the first photo of a fresh add
  (`first && pendingPhotos.length===0`, so a later batch can't clobber later edits); inner guard
  changed to `genusIsDefault = !genusId || genusId===lastGenusId` (overrides the *default* but NOT
  a deliberately-changed genus — filename is implicit vs. the explicit Scan Tag) + the same
  `await $nextTick()` render fix. Verified live on build `p`.

### Second bug (found while verifying the fix on live build `n`): species `<select>` not displaying

Even with the guard fixed, the species **dropdown** kept showing "— choose species —" while the
underlying `form.speciesId` was correctly set (Save would have worked, but it *looked* like the
species still didn't fill — matching Stephen's complaint). **Root cause:** a native `<select>`
can't bind a value whose `x-for` `<option>` hasn't rendered yet; the scanner set
`form.speciesId`/`form.genusId` synchronously, *before* the freshly-created species/genus option
was painted, so the select fell back to its placeholder. (Same class as the 2026-06-22 nested-
`<template>`-in-`<select>` bug.)

- **Verified live** (Chrome + javascript_tool): option existed + `form.speciesId` set, but
  `select.value===''`; clearing then re-asserting after `await $nextTick()` made it display
  `gigantea` (`matches:true`).
- **Fix:** in `applyTagScan`, wait for the new genus/species `<option>`s to render, *then* assign
  `form.genusId` / `form.speciesId`. Build `n → o`.
- **Refinement (build `p → q`):** the wait was first written as `await this.$nextTick()`, but Alpine's
  `$nextTick` waits on a **repaint** (`requestAnimationFrame`) — so it *stalls in a backgrounded tab*
  (caught while verifying: the genus/species rows were inserted in the DB but the function hung before
  binding the selects). Switched both `applyTagScan` and `applyDetection` to a macrotask yield
  (`await new Promise(r=>setTimeout(r))`): Alpine flushes the DOM on a microtask, so the `<option>`
  exists by the next `setTimeout`, and `setTimeout` fires regardless of paint. Real users (foreground
  tab) were unaffected either way, but this is robust + makes headless verification reliable.

## 2026-06-22 — Tag scanner (Claude Vision via Edge Function) — built + full-tier Security pass

The first **Edge Function** in the project: photograph a plant tag → Claude vision reads it →
structured fields pre-fill the add-plant form (user confirms before save). Mirrors the shipped
`applyDetection` (filename/EXIF) flow, but text comes from the tag's pixels read **server-side**,
because the `ANTHROPIC_API_KEY` cannot live in the browser. Contract: `docs/scan-tag-plan.md`.

- **Files:** new `supabase/functions/scan-tag/index.ts` (Deno; `npm:@anthropic-ai/sdk`;
  `claude-sonnet-4-6` — Stephen chose it over Haiku for accuracy on handwritten/grow-light tags;
  no dated snapshot exists for Sonnet 4.6, so the bare alias is the canonical pin); `app/index.html` gains `🏷 Scan Tag` button + `scanBusy`
  state + `onScanFile`/`scanTag`/`applyTagScan` (build `2026-06-22l → m`).
- **Process honesty (Model-Paired Dev):** the code was written **ahead of the pipeline** (Builder
  before Architect/Security). Corrected by writing the contract + running a **separated, read-only
  Security sub-agent (Sonnet)** against plan + code. This is a Full-tier surface (network egress,
  secret, auth, untrusted file input, no analog shipped) — exactly where [[feedback-dev-method]]
  mandates spawned adversarial review.
- **Security VERDICT: CONDITIONAL PASS.** Fundamentals solid: secret stays server-side (C1,
  independently re-verified by grep), anonymous callers 401'd before any Anthropic spend (C2),
  service-role key scoped to `auth.getUser` only — no cross-tenant path (C3), no SQL/DOM injection,
  RLS-scoped inserts (C7), confirm-don't-clobber + no auto-save (C5), fails safe (C8).
- **Blocking findings FIXED in the function:** C4 HIGH (no server-side `mimeType` validation →
  added allowlist before the cast); C10 MED (no payload cap → 2M-char/413 guard); C11 MED
  (`err.message` leaked → generic "Internal error" + `console.error` server-side); LOW token-parse
  robustness (`slice(7)`). C9 MED (no rate limit) → **accepted risk for solo MVP**, documented in a
  code comment; revisit before multi-user.
- **One Security finding DECLINED (verify-your-verification):** "gitignore `supabase/`." Rejected —
  the function has no secret, the repo is already public app code, and Edge Function source *belongs*
  in version control. Kept tracked.
- **Model choice (RESOLVED with Stephen):** chose **Sonnet** (`claude-sonnet-4-6`) over Haiku 4.5 —
  better on handwriting + purple grow-light tags per [[tag-scanning-findings]], ~3–4× cost, which fits
  his "quality over cost, I can be patient" stance. One-line revert to Haiku if scans feel too slow/pricey.
- **Verification status (no false green):** static only — preview sandbox can't start here (known
  `getcwd` limit) and the function isn't deployed. End-to-end is **gated on: deploy the function +
  on-device test** against the 18-photo corpus in [[tag-scanning-findings]]. Secret-absence + client
  brace-balance verified by command.

## 2026-06-22 — Products list (fertilizers/pesticides) on Fed & Pest-treated journal events

Stephen wanted structured tracking of WHICH fertilizer/pesticide was used (a reusable, addable list —
"Maxsea, Schultz Cactus Fert, etc. in the system to begin with") with the MIX/strength left free-form.
Decision: this needed a real table, not free text, so it was worth doing NOW before journal entries
accumulate — a saved picker can't be retrofitted onto free-text history cleanly.

- **Schema (Stephen ran the SQL in Supabase):** new `product` table (`id`, `user_id`, `name`,
  `category` check-constrained to fertilizer/pesticide/other, `created_at`) with RLS (`auth.uid() = user_id`).
  Two new nullable columns on `journal_entry`: `product_id` (FK, on-delete set null) and `dose_note` (text).
- **`user_id` caveat:** unlike the older tables (genus/vendor/…), this `product` table has NO
  `default auth.uid()` on `user_id`, so the app passes `user_id` explicitly on insert. Worth adding the
  column default later for consistency.
- **UX:** the product dropdown + a free-text "Mix / strength" (Fed) / "Mix / dilution" (Pest) field appear
  ONLY when the event type is `fed` or `pest_treated`, in all three editors (per-plant Log, focused sheet,
  Journal-tab quick-log). `＋ New` adds inline; category is inferred from the event type. Dropdown is
  filtered by category. Product+dose render as "Maxsea · 1/4 strength" in the timeline, sheet, and feed.
- **First-run seed:** if the products table is empty (and a per-user localStorage flag isn't set), insert
  a starter set — Maxsea, Schultz Cactus Fertilizer, MSU Orchid Fertilizer, Osmocote, Spinosad, Neem oil,
  Imidacloprid.
- **Bug the test loop caught immediately:** the seed ran TWICE → duplicate defaults (14 rows). Root cause:
  `init()` calls `loadData()` from BOTH `onAuthStateChange` and `getSession()` (classic Supabase double-fire);
  idempotent loads didn't care but seeding isn't idempotent. **Fix:** `loadProducts()` is now single-flight
  (caches its own promise so concurrent callers share one fetch+seed). Existing dupes deleted from the DB.
  *General lesson: any non-idempotent work in `loadData` must be guarded — it runs ~twice on startup.*
- Builds `2026-06-22f` (feature) → `2026-06-22g` (seed fix). Also this session: `+ Log` FAB on the Journal
  tab (quick-log sheet with plant search, build `d`); running build shown in the signed-in footer (build `e`).

## 2026-06-22 — Browser-testing via Claude-in-Chrome + first bug it caught (event-type dropdown)

Set up a real test loop: Claude drives Chrome (the connected "Browser 1") against the LIVE site with a
**throwaway account** (`test@test.com`) Stephen created (Claude can't create accounts / type passwords —
safety rules). Verified end-to-end in Chrome: add-genus → add-species (genus→species scoping works),
save plant (RLS write OK), genus-gallery home, drill-down, plant page, auto-created "Acquired" event,
and the **focused-entry sheet with the View plant · Edit · Delete row fully visible** (the iOS fix holds
in Blink too). **Caveat that stays true:** Chrome is Blink, the iPhone is WebKit — this loop catches
logic/flow/console/most-layout bugs but NOT WebKit-specific rendering (the very class the tab-bar bug was).

- **Bug it caught:** editing the auto-created **Acquired** event showed the "What happened" dropdown as
  **"Note"**, not "Acquired". Root cause = the SAME nested-`<template x-if>`-in-the-`<select>` antipattern:
  the dynamic `<option>` for non-curated types was inserted by `x-if` AFTER `x-model` had already bound, so
  the select fell back to the first option and never re-synced. Confirmed via JS: `newEvent.type==='acquired'`
  (data correct) but `select.value==='note'` (display wrong). `saveEvent` reads the DATA, so a no-touch Save
  did NOT corrupt the type — but the display lied and was fragile.
- **Fix (both editors — sheet + per-plant Log):** dropped the `<template x-if>`; all 16 event types are now
  plain static `<option>`s (common ones flat, the five lifecycle/status types under a `<optgroup>` "Status
  change"). `x-model` always finds the match → correct display, and you can now re-type any event when
  editing. Matches the standing lesson: prefer plain elements over nested `x-if` in these forms.
- Build bumped to `2026-06-22c`. HTML-only change (no JS touched).

---

## 2026-06-22 — REAL bug behind the "missing Edit button": focused sheet trapped under the tab bar

After the auto-update check shipped, Stephen force-loaded the new build and the focused-entry sheet
DID open (multi-photo grid, meta, note) — but the **action row (View plant · Edit · Delete) still
wasn't visible**, hidden right where the bottom tab bar sits. So there were TWO problems stacked: a
stale cache (fixed first) AND this layout bug. Screenshot was the giveaway — overlay dimmed the top of
the screen but the tab bar stayed bright (= painting on top of the sheet).

- **Root cause (classic iOS Safari):** both overlays (`.viewer`, `.sheet-back`) live INSIDE `.appscroll`,
  the scrolling container, which had `-webkit-overflow-scrolling:touch`. On iOS that makes the scroll
  container **contain `position:fixed` descendants and create a stacking context**, trapping the sheet's
  z-index INSIDE `.appscroll`. The `.tabbar` (sibling of `.appscroll`, z-index:20) then painted over the
  whole scroll subtree — including the sheet's z-index:45 action row. Confirmed it was the sole trap:
  `.app` is only `position:relative` (no z-index → not a context) and no ancestor has transform/filter.
- **Fix (CSS only, low risk):** (1) drop `-webkit-overflow-scrolling:touch` from `.appscroll` (momentum
  scrolling is the default on modern iOS; the property is deprecated) so fixed overlays escape to the
  viewport; (2) raise overlay z-index above the tab bar/fab — `.sheet-back` 45→60, `.viewer` 50→65
  (viewer can open from the sheet, so it stays above it). No markup moved.
- **Lesson:** a `position:fixed` overlay placed inside a `-webkit-overflow-scrolling:touch` scroll
  container is trapped under sibling chrome on iOS — keep full-screen overlays OUT of the scroll
  container, or don't put that property on the container.
- **Build bumped to `2026-06-22b`** so the new auto-updater offers it. **Verification:** JS unchanged
  (CSS-only); preview sandbox still can't start; Stephen confirms on device. If the row STILL hides,
  next step is physically moving the overlays out of `.appscroll`.

---

## 2026-06-22 — "App won't update on my phone" → auto-update check (the real cause of the missing Edit button)

Stephen reported the focused-sheet Edit button still didn't appear on his iPhone. **Diagnosis: NOT a
code bug.** Verified the always-present Edit button (`sheetEditEntry`, index.html ~line 900) is correct
locally AND on the live deploy (`curl` of the Pages URL had it; `last-modified` was current). His phone
was running a **stale cached `index.html`.** Why his workflow hid it: he keeps the tab open and
pull-to-refreshes, and iOS Safari serves the in-memory/disk-cached page rather than re-downloading — so
pull-refresh never picked up new code. The app had **no cache-busting** (no SW, no manifest, GitHub Pages
`cache-control: max-age=600`).

- **Fix — lightweight auto-update check (no service worker; SW too risky for a durability-anxious,
  non-technical owner — a bad SW can brick the app).** Single version marker `<meta name="app-build">`
  in `<head>` = source of truth. On load + on every `visibilitychange→visible`, `checkForUpdate()`
  fetches `index.html?cb=<ts>` with `{cache:'no-store'}`, regexes out the live `app-build`, and if it
  differs from the running one flips `updateReady=true`. A fixed green **"A new version is available —
  Refresh"** bar (`.updatebar`) then does `applyUpdate()` → `location.replace(pathname+'?u='+ts)`, a
  unique URL = guaranteed fresh download. Offline fetch failures are swallowed.
- **Deploy step on every future change:** bump the `app-build` content string so phones see the banner.
- **Bootstrap caveat (one-time):** Stephen's currently-cached page predates this checker, so it can't
  know to check. He must force-refresh ONCE — load
  `https://stephend7.github.io/plant-collector/app/?u=1` — to pick up the build that contains the
  checker (which also already has the Edit-button fix). After that, updates are automatic.
- **Verification:** JS syntax-checked via JavaScriptCore (clean). Preview sandbox still can't start
  (`getcwd` permission error). Stephen confirms on device.

## 2026-06-21 — Multiple photos per journal entry (migration 004)

Stephen: a journal entry should hold MANY photos (a repot: before / after / roots) and let you
replace an image. Needs a real relationship, so migration 004 adds `photo.journal_entry_id`
(nullable FK → journal_entry, `on delete set null`). An entry's photos = photos pointing at it;
`journal_entry_id is null` = a plant-level photo (unchanged). Kept `journal_entry.photo_id` as the
entry's *primary* photo so the whole-collection Journal indicator stays a cheap single-column read.

- **UI:** event editor reuses the add-plant multi-photo pattern (add several, remove each); the
  focused sheet shows all of an entry's photos in a grid (tap → full-screen viewer w/ prev-next);
  the timeline row shows the first photo + a "+N" badge. Standalone photo entries gained a
  **Replace photo** (re-upload over the same storage path — `uploadPhoto` already `upsert:true`).
- **Consistency:** the `‹ Back` button (returns to the previous tab via `prevTab`) is on Journal,
  List, AND Care now, matching the plant/photo windows. (Plants is the home root — no back.)
- **Security review of migration 004 (full-tier, isolation) — VERDICT: PASS.** Mirrors 003 exactly:
  new FK guarded on write by `(journal_entry_id is null or app_owns_journal_entry(journal_entry_id))`
  where the helper is SECURITY DEFINER + pinned `search_path`, ownership-only. Reads stay
  `user_id`-scoped → A can't see/attach to B's entries. Policy swap is wrapped in a transaction
  (atomic; RLS stays enabled = deny-all mid-swap). `on delete set null` orphans an entry's photos
  to plant-level on delete — no data loss, no cross-tenant path. Backfill links existing
  single-photo events the new way.
- **Apply step (Stephen):** run `app/migrations/004_…sql` in Supabase BEFORE relying on the new
  build — the app now selects `photo.journal_entry_id`, which errors until the column exists.
- **Verification:** JS syntax-checked via `jsc` (clean); NOT browser-run (sandbox + Supabase login).
- **Follow-up fix (2026-06-21, pushed):** Stephen reported "no Edit button at all." Cause: the
  sheet's Edit button was rendered via a nested `<template x-if>` inside the flex action row and
  didn't show reliably on iOS Safari. Fixed → one plain always-present Edit button that dispatches
  by kind (`sheetEditEntry`). Also made **event editing INLINE in the sheet** (type/date/note/
  measurement/multi-photo), matching photo-entry editing — no more jump to the plant page
  (`startSheetEditEvent`/`saveSheetEvent`). Viewer now shows the cached thumb instantly on
  prev/next then upgrades to full-res (swipe was laggy). **Still needs Stephen's on-device test:
  confirm the Edit button now appears + inline edit works for both text and photo entries.**
  Lesson: avoid nested `<template x-if>` in the focused sheet; prefer plain elements + x-show.

---

## 2026-06-21 — Journal UX pass: focused-entry sheet + sticky plant header

Screenshot-driven UX review with Stephen (full findings + the spectrum/analytics framing in
`vision.md` → "Journal UX review — 2026-06-21"). Shipped two, queued the rest.

- **Focused-entry sheet (BUILT).** Tapping any journal entry — event or photo, in the per-plant
  journal OR the whole-collection Journal tab — opens a bottom sheet (photo → full-screen viewer,
  type/date/note/measurement/cause, **Edit · Delete · View plant →**). Fixes three dead-ends at
  once: no more "dump at plant top + scroll-hunt"; every entry type now has edit/delete; photo
  entries open full-size. Principle locked: **a row tap reveals THAT entry, not the object's top.**
  One sheet reused everywhere (consistency). From the Journal tab it silently loads the plant's
  detail data so Edit/Delete reuse existing detail fns; Edit lands in the editor (scrolled to).
- **Sticky condensed plant header (BUILT).** Hero scrolls away → slim green bar (back + name +
  Edit) sticks at top. IntersectionObserver (root = `.appscroll`) toggles it, so it appears only
  after the hero is gone (no redundant double header); torn down in `closeDetail`.
- **Per-plant timeline rows** are now single tappable rows (chevron, 2-line note clamp); inline
  edit/delete removed (moved into the sheet).
- **NEXT (queued, not built):** make the Journal tab *actionable* — (1) create-from-journal
  (quick +Log, pick plant inline — a stated speed goal, biggest omission), (2) search notes +
  plant names, (3) filter by event type, (4) date grouping / oldest-first.
- **LATER:** time-pivoted "recall" lenses (this-month-last-year, next-month) + phenology/analytics
  (flowering calendar, survival, spend) — graduate into the empty **Care/Insights tab**, not the
  feed. All rides on data already captured (typed events + dated photos).
- **Verification:** JS syntax-checked via JavaScriptCore (`jsc`), but NOT run in a real browser
  this session (preview sandbox can't start + needs Supabase login). Stephen verifies on iPhone.

---

## 2026-06-20 — Journal tab built out (staged redesign step 4)

The whole-collection Journal tab was a stub (plain rows, generic dot). Built it up to the
locked spec from `vision.md` (single-line entries, type icons, photos filter):
- **Per-event type icons** — `eventIconSvg(type)` returns a small inline SVG per event type
  (note=pencil, flowered=blossom, repotted=pot, fed=drop, pest=bug, dormant=moon, woke=sun,
  measured=ruler, divided/crossed, acquired/sold/traded/given_away share a tag icon, died=faded
  leaf). Rendered in a rounded chip at the left of each row.
- **Single-line rows** — `[icon] PlantName / event·note · date + right-side indicator`. The
  right indicator follows the spec's "note / photo / none": a camera glyph when the event has a
  photo, a filled pine dot when it has a note, a faint dot when neither. Needed `photo_id` added
  to the `loadAllEvents` select (→ `hasPhoto`).
- **Friendly dates** — `fmtDate()` renders `Jun 19` (adds the year only when not the current
  year) instead of raw ISO.
- **Photos filter (All / Photos)** — segmented toggle. "Photos" lazy-loads the whole collection's
  photos (`loadAllPhotos`, signed thumbnails, newest-first) into a 2-col grid with the plant name
  overlaid; tap opens the existing full-screen viewer in a new **read-only mode**
  (`viewerReadonly`) that hides Set-cover/Delete and instead offers "View plant ›". This reuses
  the per-plant viewer rather than building a second one.
- Tapping any event row → that plant's detail page (`openPlantById`). Journal data refreshes on
  each tab entry; photos re-fetch lazily (guarded by `allPhotosLoaded`, invalidated on tab entry).
- **Not verified in-browser this session** — the Claude_Preview server still can't start in the
  sandbox (`getcwd` permission error) and the app needs a Supabase login; Stephen verifies on his
  phone after the Pages deploy. CSV export was found ALREADY built (List tab), so that Phase-1
  loose end is closed.

---

## 2026-06-18 — Event Log spine + species care fields (DESIGNED, pending sign-off)

The "plan-now so later is easy" spine, distilled from the creative session (see `vision.md`).
Collapses to ONE migration (`app/migrations/003_event_log_and_care_fields.sql`).

- **Event log = evolve `journal_entry`** (keep the name; no churn): add `event_type` (note/
  acquired/flowered/fruited/divided/repotted/fed/pest_treated/dormant/woke/measured/died/sold/
  traded/given_away/crossed), optional `photo_id`, optional `related_plant_id` (other parent in
  a cross), optional measurement (`measure_label`+`measure_value`+`measure_unit`), optional
  `cause` (death). `body` (note) becomes nullable — most events need no prose; **specifics like
  soil mix / fertilizer mixture / which pest go in the note, NOT new fields** (Stephen's call).
- **Status changes logged as events:** keep `lifecycle_status` on plant (fast filter) AND write
  a dated event on change → captures death dates + history that can't be backfilled.
- **One table powers many later VIEWS** (timeline w/ "photos only" filter, phenology, growth
  measurements, survival analysis, breeding records) — none of which need building now.
  Offspring↔parent linkage on `plant` is a LATER additive step (when seedlings get entered).
- **Species care fields:** six plain-text dropdowns (dormancy/water/feeding/light/photoperiod/
  humidity). Text not enum so options can change without another migration; empty = "No
  information available".
- **Security (full-tier):** the new FK columns (`photo_id`, `related_plant_id`) get the same
  cross-tenant-injection guard as plant/photo — RLS `with check` adds
  `(... is null or app_owns_photo/plant(...))`. **Run the adversarial security check on this
  policy change BEFORE applying migration 003.**
- **Anti-bloat (locked):** progressive disclosure, NO on/off toggle — power features behind a
  collapsed "▸ Advanced" section. **No blocking popups for optional data** (death cause is an
  ignorable inline slot, never a popup); only destructive actions (delete) get a confirm gate.
- **STATUS: signed off 2026-06-18.** Security check done (below). Ready to APPLY migration 003;
  UI built after.

**Security review of migration 003 (full-tier, isolation focus) — VERDICT: PASS.**
Attacker model = user A trying to read/affect user B's data via the event log.
- **Reads siloed:** `using (user_id = auth.uid())` → A only ever sees A's events. ✓
- **No cross-tenant FK writes:** every link guarded — `app_owns_plant(plant_id)`,
  `(photo_id is null or app_owns_photo(photo_id))`, `(related_plant_id is null or
  app_owns_plant(related_plant_id))`. A can't attach an event to B's plant, embed B's photo,
  or record a "cross" referencing B's plant. ✓
- **Helpers enforce OWNERSHIP not existence:** `app_owns_*` are `select exists(... where id=p
  and user_id=auth.uid())`, SECURITY DEFINER + pinned `search_path`; they only ever answer
  about the caller's own rows, so no existence-oracle about others. ✓
- **No user_id forgery:** `with check (user_id = auth.uid())` blocks inserting/Updating a row
  stamped as B; `using` blocks touching B's rows. ✓
- **Fails closed during swap:** DROP POLICY leaves RLS ENABLED (not disabled) → zero-policy =
  deny-all; plus the whole migration is wrapped in a transaction (atomic). ✓
- **Care fields:** plain text columns on species; ride the existing species owner policy; no new
  FK/read path → isolation unchanged. ✓
No issues found; mirrors the proven plant/photo guard from the 2026-06-17 review.

---

## 2026-06-18 — Deployed to GitHub Pages (off file://, now usable on iPhone)

- **Repo:** `github.com/stephend7/plant-collector` (PUBLIC — safe: only app code + the
  publishable Supabase key, which is useless without the owner-only RLS rules).
- **Live URL:** `https://stephend7.github.io/plant-collector/app/` (app lives in `/app/`;
  Pages serves the repo root, with a `.nojekyll` file so files serve as-is).
- **Excluded from the repo via `.gitignore`:** the three legacy spreadsheets (`*.xlsx`), the
  "Photos – Just purchased plants" folder, `.DS_Store`, and `.claude/`. Private data never left
  the laptop; plant data lives in Supabase behind locks regardless.
- **Why now:** `file://` couldn't run on the iPhone (the real-use device) and caused
  session-expiry pain. HTTPS hosting fixes both and is the proper home for the app.
- **Still TODO for production auth:** email confirmation is still OFF; when we turn it back on,
  set Supabase Site URL + redirect URLs to the live address (password-reset `redirectTo` already
  uses `location.origin+pathname`, so it'll point at the live URL once allowlisted).
- **Deploy workflow going forward:** edit locally → `git commit` + `git push` → Pages
  rebuilds in ~1–2 min. (First build verified: all assets return HTTP 200 over HTTPS.)

---

## 2026-06-18 — Photo name auto-detect (ported from the catalog app, improved)

Ported the catalog app's genus/species auto-fill and improved it for the new relational model.
- **Mechanism:** when adding photos, read the **filename + the photo's caption/title/keywords**
  (via `exifr`, bundled locally at `app/lib/exifr.min.js`, run on the ORIGINAL file before JPEG
  conversion strips metadata). Match text against a genus dictionary, parse the species with the
  catalog's botanical parser (cultivars `'quoted'`, hybrids `×`/`x` verbatim, `sp.`/`spp.`,
  `var.`/`subsp.`/`f.` ranks, STOP-word filter). Functions ported verbatim into `index.html`:
  `collectStrings`, `extractEpithet`, `matchGenusSpecies(FromString)`, `detectFromFile`.
- **Improvement 1 — works on day one:** match against the user's `genus` table **∪ a built-in
  carnivore dictionary** (`CARNIVORE_GENERA`, the catalog's 18). The catalog silently failed for
  any genus not yet in the list; ours detects then auto-creates the row.
- **Improvement 2 — maps to real dropdowns, not free text:** detected genus/species are
  selected if they exist, else created in the tables and selected (`applyDetection`). Species
  are user-specific so always create-if-missing; genus only ever comes from dict∪table so no junk.
- **Improvement 3 — freebie:** auto-fill **acquisition date** from the photo's EXIF timestamp.
- **Improvement 4 — visible & reversible:** inline green "Auto-filled … from your photo —
  change anything below" note with a dismiss link, instead of a fleeting toast.
- **Kept faithful:** confirm-don't-clobber (never overwrite a field you filled; detect from the
  first photo that hits); leftover text after a cultivar → Notes (NOT Form/Descriptor — too
  guessy). Only runs on the ADD form, never when editing an existing plant.
- **No DB migration** — uses existing genus/species tables + RLS.
- Relation to tag-scanning: this reads text already attached to the file (filenames, vendor
  captions); reading a PHYSICAL tag from the pixels is the separate OCR/AI feature (needs a
  backend + per-photo cost) — still on the roadmap, complementary to this.

---

## 2026-06-18 — Categories UI + two new plant fields (acquisition type, purchase link)

- **Categories built** (Phase 1): many-to-many tagging on the add/edit form (chip selector +
  inline "＋ New"), green chips on the detail view, grey badges on list cards, and a
  **filter strip** on the collection list. Filter is **multi-select with AND logic** (pick
  Carnivorous + South African → only plants in BOTH); **OR deliberately omitted** to keep the
  strip readable — narrowing is the intuitive default. CSV gained a Categories column.
- **Field audit vs. legacy spreadsheets** (Stephen's two + friend's): all core fields covered.
  One real gap found → **Acquisition type** added (bought/traded/gift/division/seed/other),
  from the friend's "Date Obtained – Type" column; feeds later analytics (home-grown vs bought).
- **Purchase link (`source_url`) added** at Stephen's request — the vendor listing page a
  plant came from. *Why:* those pages often carry growing instructions; collectors value the
  link itself, AND it's groundwork for a **Phase-5 feature to scrape description + grow data**
  from that page into notes/care guide. Rendered as a clickable link in the detail view.
- **Live-DB migration required:** schema.sql updated, but the live Supabase DB needs the two
  columns added via `ALTER TABLE` (see the SQL Stephen runs in the Supabase SQL editor).
- Logged in `ux-notes.md`: category overflow (filter strip + form chips wrap when many),
  reconsider chip-vs-dropdown selector, and a future navigable browse-by-genus/category index.

---

## 2026-06-17 — Data model & roadmap confirmed (the Architect step)

**Confirmed by Stephen after review. Locked unless explicitly revisited.**

1. **Reference lists are private per user**, BUT with a free **curated shared library** of
   Genus/Species users can import/subscribe to, plus **upload-to-create** your own lists, plus
   a **crowdsourcing model on the roadmap**. *Why:* private avoids one user's typo polluting
   everyone; a shared library still gives the speed/quality benefit without forcing it.

2. **Quantity vs instance:** a Plant record = an acquisition of a species, from a source, on a
   date, with a quantity. **A division INCREASES the quantity on the existing record** — it does
   NOT create a new record unless the user manually splits it out. Buying a replacement later =
   a new record. *Correction to the original draft, which had division spawning a record.*

3. **Price on shared lists:** public show list = NO price; private link-based sale list = price
   allowed. *Why:* public price invites price-shopping that deters vendors; a chosen-audience
   link is fine.

4. **Show availability:** NO live "sold out" during the show; owner reconciles inventory
   afterward. *Why:* live updates cause too much venue-wireless traffic.

5. **Buying a new plant does NOT auto-change any existing plant's status.** All lifecycle status
   changes are manual. *Correction to the original draft, which implied old ones get marked dead.*

6. **Care guide:** lives at genus+species, shared across all plants of that species; is a set of
   **dated entries** (a generic guide first, refined over time), directly **lookable**, and shows
   **"No information available"** when empty — never leave the user guessing. Auto-fetch/Google
   search is a later roadmap item.

7. **Genus → Species ordering is mandatory:** species list is filtered to the chosen genus,
   because different genera reuse species epithets (*Drosera rotundifolia* ≠ *Pinguicula
   rotundifolia*). Species is scoped to Genus.

8. **"Locality" renamed to "Location data"** (hobby term for wild origin), kept distinct from
   **Growing location** (physical placement).

9. **Photos are a timeline** — progression over time, each dated with a label
   (flower/plant/pests/other) and optional comment. Important for bonsai; valued broadly.

10. **UX principle:** always tell the user when something is unavailable; don't leave them guessing.

---

## 2026-06-17 — Photo upload pipeline & cross-platform HEIC handling

- Image processing matches the catalog app's Safari-proven mechanism (after a detour into an
  unproven `createImageBitmap` rewrite that handled HEIC worse): a plain `<img>` decode first
  (Safari/iOS read HEIC via the OS), draw to canvas, re-encode to JPEG; only fall back to the
  `heic2any` JS/WASM converter when native decode fails (non-Apple browsers). Thumbnail is made
  from the resized full JPEG. Code lives in `app/index.html` (`resizeImage`/`fileToResizedBlob`/
  `processImage`); `heic2any` is a local copy at `app/lib/heic2any.min.js`, lazy-loaded.
- **Cross-platform stance (satisfies the all-devices requirement):** every uploaded photo is
  stored as JPEG, so VIEWING is universal on all browsers/devices (public show lists, shared
  lists, Android visitors — all see JPEG). HEIC only matters at UPLOAD time:
  Safari (incl. all iOS browsers, which are WebKit) = native; Chrome/Edge/Firefox on
  Win/Android/Linux/Mac-desktop = `heic2any` fallback. Caveat: `heic2any` is less reliable and
  can fail on some iPhone HEIC variants (`ERR_LIBHEIF`) → user gets an "open in Safari / export
  as JPEG" message. Low impact: Stephen enters on Safari; non-Apple devices mostly shoot JPEG.
- Earlier bug seen: forcing ALL HEIC through `heic2any` first caused `ERR_LIBHEIF` and silent
  "nothing happens"; fixed by native-first. Also saw a transient "row-level security" error on
  save — suspected `file://` session expiry in Safari (see notes below); save now shows an
  actionable "sign-in may have expired — reload & sign in" message. Hosting over http (GitHub
  Pages) is the real cure and is planned.

---

## 2026-06-17 — App shell + auth VERIFIED end-to-end; email confirmation off for dev

- Built `app/index.html` (Alpine + local supabase-js/Alpine copies, wired to `app/config.js`).
  Stephen created an account and signed in in a real browser → reached the secured
  empty-collection screen. This empirically verifies connection + auth + RLS together.
- **Email confirmation turned OFF** in Supabase Auth for now. Why: the app runs locally over
  `file://`, so confirmation links have no real web address to return to (they showed
  "not found" even though they still confirmed the account) — confusing during development.
  **Revisit for production:** when the app is deployed (GitHub Pages), turn confirmation back
  ON and set Supabase Site URL + redirect URLs to the live address so links work.
- Local preview note: the Claude_Preview MCP server can't start in this sandbox (`getcwd`
  permission error); use `open <path>` / the browser directly to test. `.claude/launch.json`
  exists (static server on :8123) for environments where it does work.

---

## 2026-06-17 — Schema security review (full-tier, separate adversarial reviewer)

Ran a read-only adversarial security review of `app/schema.sql` (multi-tenant isolation).
Initial verdict: FAIL. Real issues found and fixed in the schema:
- **Cross-tenant foreign-key references:** owner-only RLS checked a row's own `user_id` but
  not that the rows it POINTS AT are yours. Fixed by adding `app_owns_*()` SECURITY DEFINER
  helpers and parent-ownership predicates to the WITH CHECK of every table with FKs
  (species→genus; care_guide→species; plant→species/vendor/location/cover_photo;
  photo/journal→plant; plant_category, plant_keyword, list_plant → both parents).
  Real-world risk was limited today (reads are also user_id-scoped; UUIDs unguessable) but
  fixing now removes an existence-probe and prevents a leak once Phase-3 sharing adds read paths.
- **Storage policies were entirely missing** (the higher-impact gap): photo *files* sit in a
  Storage bucket with no lock. Fixed: bucket 'photos' set PRIVATE + owner-only policies keyed
  on the path prefix `<user_id>/...`. These ship WITH the schema, not later.
- **Key discipline (operational):** the browser app must embed ONLY the anon/publishable key.
  The `service_role`/secret key bypasses RLS entirely and must NEVER reach the client or repo.
- Non-issue: `gen_random_uuid()` is built into Supabase Postgres — fine as-is.

Independent re-review of the revised schema: **VERDICT PASS** — owner-only isolation holds,
fixes verified, no new issues. Applied one optional hardening it suggested (photo `storage_path`
must sit in the caller's own folder). Schema is cleared to run in the new Supabase project.
(One INFO to remember: on *self-hosted* Postgres you'd also need to enable RLS on
`storage.objects`; on managed Supabase that's already on by default, so no action.)

---

## 2026-06-17 — Categories vs Keywords (two distinct labeling axes)

- The flexible-label entity is renamed **Category** (was "Tag/Type"). Reason: "tag" collided
  with the physical pot-label *photo* (`photo.label = 'tag'`). "Category" = the curated,
  navigable type-grouping (Bonsai / Orchid / Carnivorous / South Africa). Many-to-many, so a
  carnivorous orchid / carnivorous bromeliad lands in every applicable bucket — that overlap
  is the *point*, it puts each plant where the user expects to find it. Surfaced early in UI.
- **Keyword** added as a SECOND, distinct axis: open-ended free-form labels for arbitrary
  slicing ("won a ribbon", "gift from Dave"). Same data shape as Category, different role.
  Decision: build the STRUCTURE now (cheap; avoids a painful retrofit like the visibility
  flag), but wire up the Keyword UI in a LATER phase to keep the early app uncluttered.
- Schema: `category` + `plant_category`, `keyword` + `plant_keyword` (see `app/schema.sql`).
  The photo `label` value `'tag'` is intentionally kept (= a photo of the physical pot label).

---

## Earlier locked decisions (carried from prior sessions)

- **Stack:** Alpine.js (no build step) + Supabase + GitHub Pages.
- **Build order:** Collector DB face FIRST, show face later; design the sharing/visibility
  spine in from the start so the show face needs no retrofit.
- **Durability:** Google Sheets sync + CSV export built early (Supabase-disappears insurance).
- **Cross-platform:** must work on iPhone Safari (strictest baseline); enhance for Chrome.
- **Working method:** Model-Paired Dev Playbook — Lite tier default, full adversarial team
  (Security + Tester) for auth, RLS multi-tenant isolation, public-guest access, and untrusted
  upload (spreadsheet import / photos).
- **Visibility = security:** sharing is per-list, OFF by default, achieved via list membership +
  share toggle; owner-only fields (location, quantity, price) never enter a shared view.
