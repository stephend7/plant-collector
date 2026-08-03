# Gate A evidence — Phase A (A1, A2, A4)

**Implementation:** branch `phase-a-safety-fixes`, worktree
`/Users/stephendavis/Documents/2- Plant Collector DB/.claude/worktrees/busy-greider-dc4153`
**Spec:** `tests/specs/phase-a.md` (Codex, committed verbatim at `64a528e`)
**Date:** 2026-08-02 · **Produced by:** Claude Opus 5

## How the evidence was produced

- **Environment:** the real `app/index.html` from this branch, served over HTTP to a real
  Chromium, talking to the **live Supabase project** as the **throwaway test account**
  `stephenwd@sbcglobal.net` (user id `…f0b4b7`). RLS isolates it from Stephen's real
  collection. Baseline before testing: **16 plants, 26 journal entries**.
- **Injection technique:** `window.fetch` was wrapped to fail one specific request at one
  specific boundary — never a blanket offline toggle (spec: "a generic offline toggle is
  insufficient"). Everything else executed for real against the live backend.
- **A.8 lost-response technique (declared in advance):** the wrapper `await`s the REAL
  `journal_entry` insert so the server genuinely commits, then throws before the client
  sees the response. There is no Playwright until Phase D; this is the stated substitute.
- **Assertions are independent of the app's own code:** a separate REST client
  (`window.__T.db`) queried PostgREST directly with the session JWT, and the Storage list
  API enumerated objects. UI assertions were read from the live DOM (`offsetParent`,
  `getComputedStyle`, `innerText`).
- **Cleanup:** every `GATE-*` plant, its events, photo rows, category links, and Storage
  objects were deleted. Post-cleanup state = **16 plants, 26 journal entries, 0 test
  objects** — the exact baseline.

## Result summary

| Boundary | Result |
|---|---|
| A.1 event insert fails after primary mutation (all 4 matrix rows) | **PASS** |
| A.2 category attach fails after new plant save | **PASS** |
| A.3 thumbnail upload fails after full image | **PASS** |
| A.3 variant — cleanup itself fails → stray-file warning | **PASS** |
| A.4 photo-row insert fails after both uploads | **PASS** |
| A.5 cover update fails after photo row | **PASS** |
| A.6 collection load fails (plant query AND reference query) | **PASS** |
| A.7 double startup; single-flight holds | **PASS** |
| A.8 ambiguous event response; retry converges to one event | **PASS** |
| Normal-path control (no injection) | **PASS** |

## Gate A.1 — event fails after the primary mutation

Matrix row 1 (new plant), forced `journal_entry` POST → 500:

- **saved:** plant rows +1, plant exists.
- **not saved:** events for plant = 0; global event rows delta = 0.
- **visible:** `"Plant saved, but the history event could not be saved. Retry Dismiss"`;
  page contains no "could not save the plant"; `formError` empty.
- **Storage:** `storageOps = 0` (no mutations — see the A.1.5 note below).
- **retry:** `plantWritesDuringRetry = 0`; event ids attempted
  `["2860b036-…406", "2860b036-…406"]` → **same id reused**; events after retry = **1**
  (`acquired`); notice cleared; total plant rows delta still +1.

All four matrix rows, each with its own primary mutation and destination screen:

| Row | Primary persisted | Events before retry | Banner text | After retry |
|---|---|---|---|---|
| New plant | plant row +1 | 0 | *Plant saved, but the history event could not be saved.* | 1 `acquired`, same id, 0 plant writes |
| Full edit + lifecycle change | `lifecycle_status='dead'` ✓ | 0 `died` | *Changes saved, but the history event could not be recorded.* | 1 `died`, same id |
| Add to existing | qty 1 → 3, increased **once** | 0 `note` | *Count updated, but the history event could not be recorded.* | 1 `note`, qty unchanged by retry |
| Status tile | `lifecycle_status='sold'` ✓ | 0 `sold` | *Status saved, but the history event could not be recorded.* | 1 `sold`, same id, `detailError` empty |

## Gate A.2 — category attach fails

Forced `plant_category` POST → 500. Plant saved; **0** category links; the `acquired`
event still written (1); banner `"Plant saved, but its categories could not be saved."`;
no "could not save the plant"; **no** stray-file mention (correct — no photo cleanup ran).
**Retry:** category links → **2**, plants with descriptor still **1**, events still **1**,
notice cleared.

## Gate A.3 — thumbnail upload fails after the full image

Forced the `_thumb.jpg` upload → 500 (full upload succeeded for real).

- **saved:** plant exists.
- **not saved:** photo rows = 0; cover not set.
- **cleanup success:** `fullObjectRemains = false`, `thumbObjectRemains = false` — the
  orphaned full image was removed. One `remove` call issued.
- **visible:** `"Plant saved, but a photo could not be saved."`; no plant-failed claim;
  no stray warning (cleanup succeeded).
- **also:** the `acquired` event was still written — `runSecondary` continues past a photo
  failure rather than abandoning later steps.

### A.3 variant — cleanup itself fails

Thumbnail upload **and** the Storage DELETE both forced to 500:

- `strayFileActuallyRemains = **true**` (verified by listing Storage, not by trusting the
  request), and the banner reads
  `"Plant saved, but a photo could not be saved. A stray photo file may remain in storage."`
- Banner still asserts the plant **is** saved. The warning is on screen, **not** console-only.

## Gate A.4 — photo-row insert fails after both uploads

Forced `photo` POST → 500 (both Storage uploads succeeded for real).

- **saved:** plant exists. **not saved:** photo rows = 0, cover not set.
- **cleanup:** both objects removed — `fullRemoved = true`, `thumbRemoved = true`; the
  DELETE carried **both** paths (`…/<id>.jpg`, `…/<id>_thumb.jpg`).
- **visible:** `"Plant saved, but a photo could not be saved."`; no plant-failed claim.

## Gate A.5 — cover update fails after the photo row saved

Forced the `cover_photo_id` PATCH → 500.

- **saved:** plant row, photo row, **and both Storage objects** all present and consistent.
- **not saved:** `cover_photo_id` null.
- **Storage:** `storageDeletesDuringCoverFailure = 0` — nothing was cleaned up, which is
  correct: the photo is valid. No stray-file mention.
- **visible:** `"Plant saved, but the cover photo could not be saved."`
- **retry:** cover now set to the existing photo id; **exactly 1** plant PATCH;
  **0** Storage operations; notice cleared.

## Gate A.6 — collection load fails

| Injection | loadError | `loaded` | empty-collection message would show | other |
|---|---|---|---|---|
| plant query → 500 | "injected plant query failure" | `false` | **false** | amber notice visible with Retry + Dismiss |
| genus (reference) query → 500 | "injected genus failure" | `false` | **false** | **pre-existing `genera` preserved** — the old code coerced a failed reference query to `[]` |

- **Dismiss:** `loaded` stays `false`, empty-collection message still suppressed, and a
  slim persistent notice remains: `"Collection not loaded. Retry"`.
- **Retry:** two rapid activations returned the **same promise** (coalesced); exactly
  **1** plant select request; on success `loadError` cleared, `loaded = true`, all notices hidden.
- Screenshot of the dismissed state (real rendering): notice above the collection, amber,
  Retry button present, collection still displayed rather than replaced by "empty".

## Gate A.7 — double startup, single-flight

Both startup callers invoked in the same tick:

- `d.loadData() === d.loadData()` → **true** (one shared flight).
- Network counters: **plant select = 1**, reference selects = 5 (one per reference table).
- No mutation of any kind during startup.

## Gate A.8 — ambiguous event response

Server committed the event; the client was made to observe a failure.

- **after ambiguous failure:** plant saved; **event rows on server = 1** (it really did
  commit); client truthfully showed the amber warning; no plant-failed claim.
- **stable identity:** both attempts used id `e68a051e-…090e` — `sameIdBothAttempts = true`.
- **conflict-as-success:** retry hit the duplicate primary key and treated it as success —
  notice cleared, no further retry demanded.
- **exact DB observation:** `journal_entry` rows for that plant after retry = **1**.
- **exact UI observation:** `detailEvents.length = 1`, type `acquired`.
- **no primary replay:** plants with that descriptor = **1**.

## Normal-path control (no injection)

Plant saved; photo row = 1; cover set to that photo; category links = 2; events =
`["acquired"]`; both Storage objects present; **no notice shown**.

## Banner contract

- Amber: background `rgba(201, 154, 60, 0.14)`, border `rgb(201, 154, 60)` — same family
  as the existing `.savedbar`, never green.
- Actions are real keyboard-operable `<button>` elements labelled **Retry** and **Dismiss**.
- **No auto-hide:** still visible after 2.5 s (the existing 15 s/20 s success timers are
  not used).
- **Dismiss performs no writes:** retry callback invoked 0 times, `_resume` cleared,
  all notices hidden.

## Bug found and fixed during verification

The first implementation put `style="display:none"` plus a `:style` binding on the notice
alongside `x-show` + `x-transition`. **`x-transition` rewrites the `style` attribute and
wiped the `display:none`**, leaving an empty amber bar on screen whenever `partial` was
null — the same `x-show`/inline-`display` trap recorded in `decisions.md` 2026-07-21.
Fixed by using the project's existing `x-cloak` convention (CSS line 37) and letting
`x-show` alone control visibility. Re-verified: all three notices hidden at rest.

## Deviations from the spec, and open questions for the reviewer

1. **A.1.5 vs A.6.7 (raised before implementation, unresolved).** A.1.5 says "Any Storage
   request makes this assertion fail"; A.6.7 says signed-URL reads are not mutations.
   Post-save navigation legitimately issues signed-URL **reads**. Implemented the
   harmonized reading — **no Storage mutations**; reads permitted. Evidence above counts
   **mutations** (`POST`/`PUT`/`DELETE` on `/storage/v1/object`), which were `0` wherever
   the spec requires none. Codex to confirm or overrule.
2. **Banner text is a superset where several steps are unfinished** (A.3.2). `runSecondary`
   names every unfinished item, e.g. *"…but a photo and the history event could not be
   saved."* In the recorded A.3/A.4 runs only the photo was unfinished (the event
   succeeded), so the observed text names one item.
3. **Structural choice** (spec explicitly delegates structure): the post-plant tail of
   `savePlant` is now a resumable pipeline (`_resume` + `runSecondary`) with per-step
   done-flags. Photo **blobs are retained in `_resume`**, so Retry never asks the user to
   re-pick an image. `clearPendingPhotos()` only revokes preview URLs, which does not
   affect the retained Blobs.
4. **Two extra fixes of the same bug class, found while implementing** — not in the spec,
   both post-boundary misreports: deleting a plant then failing to refresh reported
   *"Could not delete this plant"* for an already-deleted plant; and `refreshDetail()`
   would surface a refresh failure as the caller's write failing. Both now report the
   truth without claiming the primary action failed.
5. **`schema.sql` line citations shift +3** versus the `main` the spec reviewed (Phase A3's
   header correction). Content unchanged.
6. **Not covered by this evidence:** iPhone/WebKit rendering of the new notice (Chromium
   only — Stephen's device check is the final gate), and automated regression tests for
   these behaviours, which Phase D converts from this manual evidence into Playwright
   specs before Phase F begins.
