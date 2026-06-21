# Vision — what makes this an app, not a spreadsheet

> Created 2026-06-18 from a deliberate "stop replicating spreadsheets, get creative" session.
> Companion to `architecture.md` (the built data model) and `decisions.md` (the dated log).
> This file is the **idea reservoir + the plan-now/add-later map**, so nothing evaporates.

---

## The reframe

A spreadsheet is a grid you *maintain*. An app is *alive* — it has a camera in your pocket,
it knows the date and where you're standing, it can do math, draw pictures, nudge you, and
connect you to other growers. Almost everything we'd built so far ignored those powers. The
point of this file is to use them — and to be deliberate about which ideas need to be **planned
into the data now** vs. which we can **bolt on any time** for free.

### The five app superpowers
1. **A camera in your pocket** — capture, recognize, diagnose, measure, replay over time.
2. **It knows the time** — and can nudge you (reminders, season awareness, "what's happening now").
3. **It knows where you are** — locality logging, maps of wild origins.
4. **It can compute & draw** — charts, maps, family trees, growth curves — not just cells.
5. **It connects people** — shared care, trade matching, community ID, pollination partners.
6. **It gets smarter** — AI for ID, health diagnosis, care answers.

---

## Feature ideas

### For the collector
- **Living photo timeline / time-lapse** — stitch each plant's dated photos into a swipe-through
  growth story or animated time-lapse. Huge for bonsai / Nepenthes. *(Data already captured.)*
- **"What's happening now" home screen** — instead of a grid: *"3 flowering · 2 should enter
  dormancy this week · Sarracenia division season · haven't photographed the Cephalotus in 4 mo."*
- **Season-aware care reminders** — CP-specific: temperate winter dormancy on/off, low-TDS water,
  feeding, repotting cycles — tuned per species, delivered as notifications.
- **Health check from a photo** — AI flags likely cause (mineral burn, low light, fungus gnats,
  crown rot) with CP-specific advice. Same vision tech as tag-reading, pointed at diagnosis.
- **Light meter** — use the phone sensor to check if a spot is bright enough for a species.
- **Collection-origins world map** — plot each plant's wild locality; see your collection span
  the Carolinas / Western Australia / the Cape. *(Geocode the locality text we already store.)*
- **Survival & spend intelligence** — which vendors' plants thrive vs. die; what you keep
  re-buying and killing; collection size & value over time (the friend's growth graph, automatic).
- **Wishlist + trade matching** — your wants matched against others' surplus; alerts on matches.
- **Smart QR pot tags** — scan a pot to jump straight to that plant's record (lost-tag + fast field updates).

### For the botanist / serious grower (the rigor layer)
- **Lineage & breeding tree (crown jewel)** — pollination events (pollen × seed parent), seed
  batches, germination %, F1/F2 generations, a tap-through family tree of your hybrids/clones.
- **Phenology across years** — flowering/fruiting dates charted year over year (real scientific signal).
- **Measurements over time** — pitcher height, trap size, leaf count → growth curves, exportable.
- **Rigorous taxonomy** — authorities, synonyms, basionyms; links to POWO / IPNI; type locality.
- **Herbarium-grade provenance** — collector, collection number, GPS, elevation, habitat notes.
- **Conservation layer** — CITES appendix + IUCN status per species; flag protected plants (matters for a seller).
- **Contribute to science** — push observations / locality data to iNaturalist / GBIF.

---

## The plan-now vs. add-anytime map

**The dividing line is TIME.** New *views/calculations* over data we already collect cost nothing
to defer. Things that **record events or measurements over time** must start being captured now —
you can never recreate history you didn't record. (Same logic as building the visibility flag and
category tables early to dodge a painful retrofit.)

### 🟢 Add anytime — new views over data we already have (no foresight)
Photo timeline / time-lapse · "what's happening now" (basic) · collection-origins map (geocode
existing locality text) · spend & collection-size analytics (current-state parts) · taxonomy /
CITES / IUCN enrichment (reference data, fill any time).

### 🔵 Add anytime — device/tech feature layers (no data foresight; some need a small backend)
Photo health-check AI · light meter · QR pot tags · push notifications · iNaturalist/GBIF export ·
trade matching (rides on the sharing spine already designed in).

### 🔴 Plan the data capture NOW — history that can't be backfilled
1. **Status history with dates** — log status changes (died/sold/…) as dated events instead of
   overwriting. Powers survival analysis, the "what's happening now" feed, losses-over-time.
2. **Typed events (phenology)** — give the journal an event *type* (flowered/fruited/divided/
   repotted/fed/died/measured). Turns the journal into a queryable record feeding the timeline,
   phenology charts, and the dashboard. *(Partly captured today via dated flower photos.)*
3. **Breeding / cross events** — record crosses when made (pollen × seed parent → seed batch).
   Table is easy to add later; the *events* are lost if not captured. Lineage-later, capture-now.
4. **Measurements over time** — easy table, but time-series only exists if logging starts early.
5. **Care Guide structure decision** — freeform notes vs. a few **structured** care attributes
   (dormancy + season, water type, feeding, light). Reminders/dashboard can only *compute* with
   structure. Decide before writing the care guide.

### Good early bets already made
Dated photos · the instance model (so "bought-and-killed-three-times" is answerable later) ·
categories · the sharing/visibility spine · keyword structure.

---

## The one piece of insurance to buy now
**Design the journal as a typed "event log" (with dates), and treat status changes as events.**
That single spine feeds four of the favorite ideas at once — photo timeline, phenology, survival
analytics, live dashboard — and it's the only thing that bleeds value every day we don't have it.
Everything visual (map, time-lapse, charts) can wait with no penalty.

See `decisions.md` for the confirmed design of this event-log spine once locked.

---

## Reviewed design — Event Log, Care Guide, anti-bloat (2026-06-18, Stephen)

**North star (Stephen, verbatim intent):** *don't bloat this; if these things are in there,
they need to be easy.* Every decision below bends to that.

### The Event Log (the spine)
One dated timeline of "things that happened" to a plant. Each event:
- **date + type + note** (free text), plus optional **photo**, optional **measurement**
  (number + unit), optional **second plant** (for a cross).
- **Specifics go in the note, NOT new fields** — soil mix, fertilizer mixture, which pest.
  Lean, but queryable by type + date ("when did I last repot / fertilize / see pests?").
- **Types (starter, extensible):** Acquired · Flowered · Fruited/set seed · Divided ·
  Repotted · Fed · Pest/disease treated · Went dormant · Woke · Measured · Died ·
  Sold/Traded/Gave away · Crossed (pollinated) · Note.
- **Unified timeline with a "Photos only" filter** — default shows everything; flip to see
  just the dated photos and swipe the progression. (Photo-timeline + journal, one thing.)
- **Status changes are events:** keep `lifecycle_status` on the plant (fast filter) AND write a
  dated event when it changes → gives death dates & survival history without complicating reads.

### Death → cause (optional, NO popup)
Marking **Died** is one tap, done — no popup, nothing to dismiss. The cause is an **optional
slot on that event** ("Cause? ▾"): a quick pick-list — Overwatered · Underwatered · Dried out ·
Pest (thrips/etc.) · Crown rot · **+ add your own** — that you fill if you feel like it and
ignore forever otherwise. Extensible like categories. Powers "what actually kills my plants"
off whatever causes get jotted. Pest specifics go in the note.

### Measurements & the Experiments module
- Measurements = an optional number+unit on a "Measured" event. No setup if unused.
- **Experiments = a LATER opt-in module**, mostly free because it rides on typed events +
  measurements: group plants ("fertilizer A vs B"), record treatment, chart the measured outcome.
  Nothing special to design now — the event spine already makes it possible.

### Care Guide — six structured fields (quick dropdowns)
Dormancy (needs winter cold? which months) · Water (rain/distilled vs tap-ok) · Feeding
(no/occasional/regular) · Light (full sun/bright/shade) · **Photoperiod** (day-length sensitive,
e.g. Nepenthes) · **Humidity** (low/moderate/high). *Enhancement (later):* AI pre-fills these from
imported/crowdsourced prose care text; user confirms.

### Anti-bloat mechanism — progressive disclosure, NO toggle (LOCKED 2026-06-18)
Decided against any on/off mode. Reason: every independent toggle doubles the app's possible
states (6 toggles = 64 combinations to test) — the real source of bugs and layout surprises.
Instead:
- Everyday stuff (add plants, photos, quick journal events, care guide) sits right there, clean.
- Power-features (Measurements, Breeding/lineage tree, Experiments) live behind a collapsed
  **"▸ Advanced"** section — always available, never in the way, nothing to switch, no
  combinations to test. (Our top-to-bottom card layout collapses cleanly: hidden = page just
  shorter, no holes.)
- A single Simple/Detailed switch can be added LATER if collapsed headers ever annoy — cheap,
  because by then it's just one switch.

### UX principle — small frictions matter; optional never interrupts (LOCKED 2026-06-18)
- **Optional is optional — it never blocks.** No popups for data you can skip; offer it as an
  ignorable inline field instead (see Death → cause).
- The app only stops you for a genuinely **destructive, hard-to-undo** action (e.g. *deleting*
  a plant → keep the two-tap confirm). Reversible actions (marking dead) never get a gate.

### Upload species per genus (reference-data import)
The "upload-to-create reference lists" feature: bulk-load species into a genus's dropdown.
Distinct from importing the actual plant collection. Head start: legacy `Sheet11` = 133 species
across 8 genera, ready to seed. On the roadmap.

---

## DESIGN DIRECTION — locked 2026-06-19 (the redesign)

Stephen's brief: "blow people away with intuitiveness and pure beauty… how beautiful, I want to
use this all the time." The plants are the product, not the data. Mockups reviewed + approved.

- **Theme: LIGHT & BOTANICAL (locked).** "This is joy, it's fun." Off-white/airy, one deep
  botanical green accent (~#2E5E43), full light+dark support. NOT the current dark theme.
- **Type:** serif *italic* for every plant & genus name (botanical convention); clean sans for UI.
- **Photography-first:** the plant's cover photo is the hero on every surface. Flat fills in the
  mockups stand in for real photos; payoff scales as the collection is photographed.
- **Home = a photo gallery** ("Collection"), 2-col card grid, with one control to regroup the
  SAME gallery: All / By genus / By category. Search. Grid is the default; a list option exists.
- **Browse = the drill-down** Stephen described, kept verbatim from his AppSheet idea but
  re-skinned: Category → Genus (rows w/ thumbnail + count) → Plant. (Keep its brain, drop its
  flat body.)
- **Tab bar:** Plants · Journal · ( + ) · Browse · Care.
- **Journal is its OWN place:** a Journal tab (whole-collection feed) AND a section at the bottom
  of each plant page (artful heading + latest 1–2 entries + "View all N ›"). Tapping opens the
  full journal with the species name PINNED at top as you scroll. Entries are SINGLE LINE:
  [type icon] Event · date · a right-side indicator dot (note / photo / none).
- **Plant page info hierarchy (3 tiers):** (1) instant, no scroll — photo, name, what it is,
  Location data + Growing spot (both moved UP top, per Stephen), care-at-a-glance; (2) one
  glance down — status, quantity, acquisition; (3) tap to expand — accession, listing link,
  full dated care guide, journal.
- **Care-at-a-glance = ICON SCALES, not words** (universal across plant types — solves the
  cactus/Hoya/houseplant vocab problem): **Water = amount (1–3 drops) PLUS an "RO" purity tag**
  (CP-critical; tag only when needed) · **Light = sun→shade phases** · **Dormancy = yes badge,
  tap for months/precision** · **Photoperiod = hour range (e.g. 12–14 h)** · Humidity · Feeding.
  **Tap any care tile → the precise, dated care detail.** ("Liked how you did the water.")
- **Naming fix:** the locality field is **"Location data"** (not "Wild origin") everywhere.

### Staged build order (get Stephen's eye at each step; don't disappear)
1. **Theme + type pass** on the current app — light botanical palette + serif names. Fastest
   "whole app suddenly feels like this" win; low-risk, reversible.
2. Gallery home + the All/Genus/Category grouping control.
3. Plant page redesign — Location/Growing up top, care-icon strip, journal section at bottom.
4. Journal tab + full journal screen (pinned species header, single-line entries).
5. Browse drill-down polish + the shared-element photo→hero transition.

## Jobs-to-be-done & the home, locked 2026-06-19 (task-driven design)

Why people open the app (Stephen's ranking + analysis). Frequency drives the design, not looks.
- **Three co-equal SPEED goals (the design contract):** (1) quick to ADD a plant, (2) quick to
  FIND a plant, (3) quick to add a JOURNAL entry. None dominates; none crowds the others.
- **Journaling reality:** the obsessive grower (Stephen's friend) is the exception — *most won't
  journal often*. BUT the journal is important to the software's value, so it must be **easy,
  fast, inviting, and discoverable** to ENCOURAGE casual use — never buried, never dominant,
  never nagging. "Easy enough to be tempting." Encouragement mechanisms:
  - a friendly, prominent **"Log"** on every plant (not a tiny buried link);
  - a soft, ignorable **"Add a note?"** inline nudge right after adding a photo (no popup);
  - **inviting empty states** ("Start this plant's story →") instead of blanks;
  - keep it **discoverable** (hiding it would kill the behavior we want);
  - **no streaks / guilt / badgering** — invitation, not pressure.
- **Other jobs surfaced:** find a specific plant fast (underlies "check a sick plant" + "show a
  friend"); "do I already own this / did I kill it before?" (at a sale); "where did I put it?"
  (greenhouse location); mark status change; look up care; show/share a *sale/trade list*
  (seller); admire; analytics; identify a tagless plant; export/backup.

### Converged nav + home (LOCKED 2026-06-19 — supersedes earlier mockup details)
- **Tab bar: Plants · Journal · List · Care**, plus a floating **"+"** (green FAB, bottom-right,
  like the old AppSheet) = **Add a plant**, instant, one tap, NO menu (camera leads *inside* the
  add flow). Walk back the earlier "capture-first +" and the "drop Journal" idea — Journal IS a
  tab (visible = encourages use, per Stephen).
- **Plants tab = the home = a GENUS gallery**, NOT individual plants. Each genus = a card with a
  **representative photo borrowed from that genus** (auto-pick most-recent; option to pin a
  favourite as the genus "face") + its plant count. Tap genus → its plants (same photo grid) →
  plant page. **Search pinned at the top** searches plants by name directly (skips the
  hierarchy). A grouping control: **All genera / By category** (category groups the genus cards).
- **List tab = a TRUE text list — NO graphics/thumbnails.** Just plant names, **grouped/sorted by
  genus** (genus headers), dense and scannable like a spreadsheet. **Filter by category, by genus,
  or both.** For the spreadsheet-minded (Stephen: "spreadsheet users will miss scanning a list…
  literally a list, no graphics"). Natural home for **Export CSV**. Two roads to the same plant
  page: gallery (eyes) + list (scanners).
- **Journal tab = whole-collection journal** (discoverable, inviting); journaling is ALSO one tap
  on each plant + the gentle "add a note?" nudge.
- **Care tab** = care guides / what-needs-doing (later phase).
- Coded-pot-tag (QR) scanning stays a LATER find-accelerator, not a dependency.

## Favorites to chase (subjective, for sequencing)
1. Living photo timeline / time-lapse (data's already there; emotional payoff).
2. Season-aware care reminders (the daily-use hook; very CP-specific).
3. Breeding/lineage tree (serious-grower crown jewel; impossible in a spreadsheet).
4. Collection-origins world map (best "this isn't a spreadsheet" demo).

---

## Journal UX review — 2026-06-21 (Stephen, screenshot-driven)

Stephen walked the journal with a UX lens. Findings + the agreed direction:

### The focused-entry sheet (LOCKED + BUILT 2026-06-21)
**Problem:** tapping an entry in the Journal tab dumped you at the *top* of the plant page
(scroll-hunt to the journal, then Edit); only *event* rows had edit/delete (photo rows had
none); and photo entries couldn't be opened full-size. Three dead-ends.
**Principle:** *tapping a row should reveal THAT thing, not navigate to the object's top.*
**Decision:** one **focused-entry bottom sheet**, reused in BOTH the per-plant journal and the
whole-collection Journal tab. Shows the photo (tap → full-screen viewer), type/date/note/
measurement/cause, and **Edit · Delete · View plant →**. Fixes all three at once with one
consistent pattern. From the Journal tab it silently loads the plant's detail data so
Edit/Delete reuse the existing detail functions; Edit lands in the entry editor (scrolled to),
not the page header. *(Reuse the same sheet everywhere — consistency is half the win.)*

### Sticky condensed plant header (LOCKED + BUILT 2026-06-21)
Scrolling the plant page lost all "which plant am I on?" context. Apple large-title collapse:
hero scrolls away → slim green bar (back + name + Edit) sticks at top. (IntersectionObserver,
not plain CSS sticky, so it appears only AFTER the hero is gone — no redundant double header.)

### Make the Journal tab actionable (NEXT — not yet built)
Today it's read-only browsing. A whole-collection journal should let you DO things. Priority:
1. **Create from the Journal tab** — quick "+ Log" that picks the plant inline. This is a
   *stated speed goal* ("quick to add a journal entry") yet the only way to log today is
   plant → open → scroll → Log. Biggest omission.
2. **Search** — note text + plant names ("which plant did I treat for thrips?"). Turns the
   journal into a queryable record; value compounds with every entry.
3. **Filter by event type** (and plant/category) — grow the All/Photos toggle into this.
4. **Sort / date-group** — newest-first default + "This week / June / Earlier" headers;
   oldest-first option for reading a plant's story start-to-finish.

### Time-pivoted journal = the bridge to analytics (LATER — capture-now, build-later)
Stephen's insight: the most valuable journal questions are *temporal*, and they shade into
analytics. A useful mental model — a spectrum:
- **Feed** — "what happened, newest first" (today's journal).
- **Recall** — "what happened *at this time*": what did I do last month / this month last
  year / what's likely due next month. Still individual entries, pivoted by date. *Memory.*
- **Analytics** — "what are the *patterns*": flowering calendar across years (phenology),
  bloom-timing shifts, survival rates, spend/collection-size over time. *Aggregations/charts.*
"What was in bloom this time last year" sits on the **Recall→Analytics seam** (one date = recall;
across years = phenology = analytics). **All of it rides on data already captured** (typed
`flowered` events + dated photos) — the payoff of the event-log spine; no new capture needed.
**Where it lives:** Journal owns **Feed + Recall** (still about entries); true **Analytics
graduates into the Care/Insights tab** (currently empty) — don't muddy the feed with charts.
This stays a *later* phase per the roadmap, but it's the strongest "not a spreadsheet" moment
and a natural anchor for the empty Care tab.
