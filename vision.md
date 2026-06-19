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

### Death → cause (optional, skippable)
Marking **Died** offers a quick pick-list — Overwatered · Underwatered · Dried out · Pest
(thrips/etc.) · Crown rot · **+ add your own** — and can be skipped. Extensible like categories.
Powers "what actually kills my plants." Pest specifics go in the note.

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

### Anti-bloat mechanism — Simple / Detailed mode
One toggle in Settings (easiest to grok, reversible):
- **Simple (default):** add plants, photos, quick events (flowered/repotted/pest/died+cause),
  care guide. Everyday journaling stays here — it's core, not advanced.
- **Detailed (opt-in):** also shows Measurements, Breeding/lineage tree, Experiments.
Finer per-feature toggles can come later; one switch is the least-bloat start.

### Upload species per genus (reference-data import)
The "upload-to-create reference lists" feature: bulk-load species into a genus's dropdown.
Distinct from importing the actual plant collection. Head start: legacy `Sheet11` = 133 species
across 8 genera, ready to seed. On the roadmap.

---

## Favorites to chase (subjective, for sequencing)
1. Living photo timeline / time-lapse (data's already there; emotional payoff).
2. Season-aware care reminders (the daily-use hook; very CP-specific).
3. Breeding/lineage tree (serious-grower crown jewel; impossible in a spreadsheet).
4. Collection-origins world map (best "this isn't a spreadsheet" demo).
