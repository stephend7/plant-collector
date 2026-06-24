# Plant Collector Database — Architecture & Data Model

> **Status:** DESIGN, confirmed with Stephen 2026-06-17. No code written yet.
> This is the shared brain for the project — re-read it at the start of every session.
> Plain language on purpose (the owner is non-technical). Companion file: `decisions.md`.

---

## What we're building

A relational collector database for carnivorous (and other) plants — the **paid "full DB
face"** of one shared platform whose other (free, public) face is the show marketplace.
One backend, one shared core, two faces, gated by entitlements. **We build the collector
DB first;** a show listing is just a curated, shared *view* of the private collection, so
it layers on later with no rebuild — provided we design sharing in from the start (we do, below).

**Stack:** Alpine.js (no build step, loads from a script tag) + Supabase (Postgres +
Storage + auth) + GitHub Pages. Must work flawlessly on iPhone Safari; enhanced where
Chrome allows. Google Sheets sync + CSV export exist from day one (data-durability promise).

---

## The one idea everything hangs on: Species vs Plant

- A **Species** is *shared knowledge* — "Drosera prolifera," how to grow it, what its
  flower looks like. Described once, reused forever.
- A **Plant** is *one thing you own* — bought from a vendor, on a date, in a spot, alive or dead.

Each acquisition is a **new Plant record**, even for a species you've owned before.

**Important correction (2026-06-17):** buying a new one does **NOT** automatically change
the status of any old one. Maybe you just bought another that looks a little different.
**All lifecycle status changes are manual.** The instance model is what lets analytics like
"how many times have I bought this and killed it" fall out later — but only from statuses
*you* set, never inferred.

**A Plant is a lineage/provenance, not a tally of look-alikes (2026-06-23).** Two rows of the
same species are NOT redundant: a *Pinguicula cyclosecta* from Rainbow Carnivorous and one from
California Carnivores stay **separate plants**, even when visually identical or the difference
isn't worth noting — the *origin* is the identity. Because plants propagate (leaf pullings strike,
clumps divide), **quantity counts the offspring *within* one lineage** (your 3 become 5), which is
why quantity lives on the individual row and is never summed across a species. **Never merge
same-species rows into one count** — that erases provenance and propagation history. (Import
consequence: the importer must not auto-collapse rows sharing genus+species; more plants than
species is normal, not a dedup opportunity.)

---

## Naming: Genus → Species → Form/Descriptor

Pick **Genus first**, then choose **Species from a list filtered to that genus.** This is
required, not cosmetic: different genera reuse the same species epithet and mean totally
different plants (e.g. *Drosera rotundifolia* vs *Pinguicula rotundifolia*). So **Species is
always scoped to its Genus.**

- **Genus** — controlled dropdown, one-tap add. Last-picked pinned to top, rest alphabetical.
- **Species** — scoped to the chosen genus; alphabetical with last-chosen pinned; 2nd item
  is always "+ new species" (inline add). Carries the full naming complexity: cultivars in
  `'single quotes'`, hybrids marked by `×`/`x`/`X` (grab the whole remainder verbatim),
  `sp.`/`spp.` undescribed (preserve case), genus abbreviation (`P.` inside a Pinguicula entry).
- **Form/Descriptor** — free text third slot for anything taxonomy can't hold (color forms,
  messy hybrid strings, clone designations).

Controlled lists always: point at a real table (no `#REF!` breakage), trim trailing
whitespace (no `"Pinguicula"` vs `"Pinguicula "` rot), and allow one-tap add.

---

## The data model

### Things you own

**Plant** — one row per plant acquired. Holds:
- link to its **Species** (and through Species, its **Genus**)
- **Form/Descriptor** (free text)
- **Source/Vendor** it came from
- **Acquisition date** and **quantity** (bought 3 at once)
- **Acquisition type** — HOW you got it: bought / traded / gift / division / grown from seed /
  other (from the friend's "Date Obtained – Type"; feeds later analytics)
- **Acquisition price**
- **Accession / clone ID** in its *own* field, tied to the source (e.g. `BE-3390`) — never
  mashed into the name
- **Purchase link** (`source_url`) — the vendor listing page the plant came from; these pages
  often carry growing instructions (groundwork for the Phase-5 scrape-grow-data feature)
- **Location data** — where it's from *in nature* ("Warby Range, Victoria, Australia"). This
  is the hobby term ("location" / "location data") for wild origin. Distinct from ↓
- **Growing location** — where *you physically put it* (garage rack, Wardian case,
  windowsill). A per-user customizable list, one-tap add.
- **Pot / container + a photo of it** — finer-grained location, to help find a tagless plant later
- **Lifecycle status** — in collection / dead / sold / traded / given away (always set manually)
- optional **plant-level notes**

**Photo (a visual timeline)** — multiple per plant, capturing **progression over time**
(vital for bonsai growers; valued by Nepenthes and most others). Each photo carries:
- a **date**
- a **label** — flower / plant / pests / other (extensible)
- an optional **comment**
- a "cover" flag (which one shows first)

We capture two by default at entry: one *with* the tag (for reading the label / OCR) and one
clean shot. Photos and the journal are close cousins — photos *are* a kind of journal.

**Journal / Event log** (the spine — design locked 2026-06-18, see `vision.md` + `decisions.md`)
— one dated timeline of "things that happened" to a plant. Each event carries:
- a **date** and an **event type** (note / acquired / flowered / fruited / divided / repotted /
  fed / pest_treated / dormant / woke / measured / died / sold / traded / given_away / crossed)
- an optional **note** (free text — soil mix, fertilizer mixture, which pest all live here, NOT
  in separate fields)
- an optional **photo** (a photo that *is* the event), optional **measurement**
  (label + value + unit, e.g. "pitcher height" 14 cm), optional **second plant** (the other
  parent in a cross), optional **cause** (death cause — extensible pick-list, never a popup).
- **Status changes are logged as events:** the plant keeps its current `lifecycle_status` (fast
  to read/filter) AND a dated event is written on change — that's what captures death dates +
  history we can't backfill.
This one table quietly powers the photo timeline (filter to "photos only"), phenology, growth
measurements, survival analysis, and breeding records — most of which are just *views* added
later. Everyday journaling stays in the core; the heavier views live behind "▸ Advanced"
(progressive disclosure, no toggle).

### Reference lists (make entry fast)

- **Genus** — see naming, above.
- **Species** — genus-scoped; also the home of the **Care Guide** and **searchable
  descriptors** (flower color, etc. — groundwork for the lost-tag feature).
- **Vendor / Source** — name, company, address, phone, URL; inline "add new" in the entry flow.
- **Growing Location** — per-user customizable list.
- **Category** — the curated, NAVIGABLE type-grouping people browse by (Bonsai, Orchid,
  Carnivorous, South Africa...). Many-to-many; a plant can be in several at once, so a
  carnivorous orchid lands in BOTH "Carnivorous" and "Orchid" and appears wherever the user
  looks. A *separate axis* from the genus hierarchy. The PRIMARY segmentation axis, surfaced
  early in the UI. ("tag" as a word is reserved for the physical pot-label photo, not this.)
- **Keyword** — open-ended, FREE-FORM labels for slicing the collection any way the user
  wants ("won a ribbon," "gift from Dave," "needs repotting"). Same shape as Category but a
  DISTINCT axis/role. Structure built in NOW (no retrofit later); the UI is wired up in a
  LATER phase to keep the early app uncluttered.

### Care Guide (at the Species level, versioned)

- Lives at **genus + species** level, shared across every plant of that species.
- **Two levels / evolving:** a **generic** guide (the first thing you get), then **dated
  updates** as more information comes in. So a care guide is a list of **dated entries**, not
  one static blob.
- **Lookup anytime:** look up a genus+species care guide directly. If present, show it. If
  not, say **"No information available"** — never leave people guessing. (UX principle:
  always state when something is unavailable.)
- **Structured care fields (added 2026-06-18, so reminders/dashboard can compute):** six quick
  dropdowns on the species — **dormancy** (winter cold? months), **water** (rain/distilled vs
  tap-ok), **feeding** (no/occasional/regular), **light** (full sun/bright/shade),
  **photoperiod** (day-length sensitivity, e.g. Nepenthes), **humidity** (low/moderate/high).
  Stored as plain text (UI offers the choices) so options can change without a migration.
- **Later (roadmap):** crowd-sourced shared care guides; auto-fetch / automated Google search;
  AI pre-fills the structured fields from imported prose care text (user confirms).

### The sharing layer (security-sensitive)

- **List** — a named thing the user creates. Has a purpose (collection / grow / sale / trade
  / event), an optional event + date ("Sales list for BACPS Show 2026"), and a **share toggle
  that is OFF by default**, flippable anytime.
- **List membership** — many-to-many (a plant on many lists; a list of many plants).
- **Offer status** (separate per-plant axis): for sale / for trade / not offered. Sale plants
  may carry a **price**; trade plants link to a **trade-for** (specific plants or the wishlist).

Three independent axes, never merged: **lifecycle** (alive & mine?), **offer** (am I offering
it, how?), **visibility** (who can see it? — achieved through list membership + the share toggle).

---

## How sharing stays safe (the security model)

This is the full-tier surface; spelled out deliberately.

1. **Locked doors by default.** Row-level security in the database means one account
   *physically cannot* read another's plants. Enforced by the database, not by careful screens.
2. **Sharing never unlocks the door.** Publishing a list does **not** loosen that rule on
   your real records. We generate a **separate, stripped-down copy** with only the fields meant
   for that audience. **Location, quantity, and acquisition price stay owner-only, always** —
   they can never leak into a shared view. This is the concrete anti-theft guarantee
   (people breaking into greenhouses to steal known-valuable plants is a real risk).
3. **Two flavors, different field sets:**
   - **Public show list** (QR at a show) → *plant names only*, no photos, no prices.
   - **Private sale/trade list** (a link to chosen people) → may include price and trade-for.
     Uses an unguessable token; dies the moment sharing is toggled off.
4. **Same mechanic everywhere.** Show listing, shared grow list, sale/trade list are all the
   same thing underneath: a curated subset of the private collection, rendered for an audience.

---

## Reference-library sharing & crowdsourcing

Reference lists (Genus/Species) are **private per user**, but:
- **Curated shared library** of Genus/Species that users can **import / subscribe to (free).**
- **Upload-to-create:** the owner can build Genus/Species lists by uploading a file.
- **Crowdsourcing model (roadmap):** let the community contribute/grow the shared library
  (and eventually shared care guides). Free.

---

## Roadmap (phased to avoid bloat; DB first)

Each phase ends with a real verification gate (tested in a real browser, Safari included).
`🔒` = full adversarial team (dedicated Security + Tester); others use the lighter default.

- **Phase 0 — Foundation & safety net.** `🔒`
  Skeleton (Alpine + Supabase + GitHub Pages), email/password login, core tables + locked-doors
  rule, **Google Sheets sync + CSV export from day one.** Commit `architecture.md` + `decisions.md`.

- **Phase 1 — Get your collection in.** `🔒 (import)`
  Fast entry flow (create → in-app camera → genus-scoped dropdowns with ordering rules →
  inline add). Plants, Species, Vendors, Locations, Tags, Photos. Genus-grouped views + tag
  filtering. Spreadsheet import with field-mapping — *your own* data first. Lifecycle status.
  Species-level care guide (generic + dated updates) with "no information available" on misses.

- **Phase 2 — Depth, quietly.**
  Per-plant dated journal, photo timeline with labels (flower/plant/pests), searchable
  descriptors (flower color), pot+photo location and the "I'm moving this plant" action,
  basic quantity tracking (incl. division increases quantity).

- **Phase 3 — Lists & sharing.** `🔒`
  Named lists, per-list share toggle, share links + revocation, offer status (sale/trade +
  price + trade-for), curated-snapshot publishing (field whitelist), export to PDF / text / CSV.

- **Phase 4 — The show face.** `🔒`
  Public guest QR access (no signup), static-snapshot/CDN read path, cross-vendor search,
  booth location, shopping lists, vendor self-registration, admin controls, comp/sponsor
  toggle, tag-scanning OCR, entitlement gating.

- **Phase 5+ — Later / fun.**
  Curated-library **crowdsourcing**; auto-fetch / automated Google care-info search;
  **scrape description + grow data from a plant's purchase link** (the `source_url` field —
  vendor listing pages often carry growing instructions; pull them into notes/care guide);
  breeding & seed tracking (parentage); lost-tag photo-match ID; analytics
  (collection-over-time, losses, repurchase-after-death); P-Touch label printing; paid registration.
