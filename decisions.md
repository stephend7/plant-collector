# Decisions Log — Plant Collector Database

Newest decisions on top. Each entry: what was decided, and why. Companion to `architecture.md`.

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
