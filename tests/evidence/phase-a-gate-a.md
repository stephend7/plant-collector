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

---

# Addendum — Codex Gate A rulings (2026-08-02), implemented and re-verified

Codex approved all four interpretations and added requirements. Everything below was
implemented AFTER the first evidence pass and re-verified; nothing was weakened.

## Ruling 1 — Storage: "no mutation; reads permitted" — CONFIRMED, and re-measured

Evidence now counts Storage **mutations** (`POST`/`PUT` to `/object/photos/…`, `DELETE`)
separately from **reads**. Every non-GET request during a startup load was logged and
classified:

```
nonGetRequestsDuringStartup: [ { method: "POST", path: "/storage/v1/object/sign/photos" } ]
classification:              [ "signed-URL generation = READ (permitted by ruling 1)" ]
```

So the one non-GET call during startup is signed-URL generation, not a mutation. Event-only
failures and retries recorded **0** Storage mutations (Gate A.1, A.5 above).

## Ruling 3 — three-way outcome distinction — IMPLEMENTED (this was NOT in the first pass)

The first implementation flattened every unfinished item into "could not be saved". That is
wrong for a dropped connection, where the work **may already be saved**. The notice now
distinguishes three genuinely different situations, verified by three separate injections:

| Situation | Injection | Observed banner |
|---|---|---|
| **Known failed** — server answered and rejected | `journal_entry` POST → 500 with `code:"XX000"` | *"Plant saved, but the history event could not be saved."* |
| **Outcome unknown** — no verdict returned | real insert committed, then `TypeError('Failed to fetch')` | *"Plant saved, but the history event could not be confirmed (it may or may not have been saved)."* |
| **Not attempted** — depends on a step that failed | thumbnail upload → 500 (cover depends on the photo row) | *"Plant saved, but a photo could not be saved; the cover photo was not attempted."* |

**Classifier derived from measured fact, not assumption.** The real supabase-js error
shapes were probed first:

```
network drop   → { message:"TypeError: Failed to fetch", code:"", hint:"", details:<stack trace> }
server reject  → { message:"injected reject",            code:"XX000", hint:"h", details:"d" }
```

`code` (or an HTTP status) is therefore the only reliable discriminator. An earlier version
of the classifier also keyed on `details`/`hint` — which are populated in **both** cases —
and consequently mislabelled dropped connections as "failed". Found by probing the actual
error objects rather than trusting the first implementation; fixed and re-verified.

## Ruling 5 — A.8 must be proven, not assumed. All six proofs:

| Required proof | Evidence |
|---|---|
| First request reached the server and committed | `eventCommittedOnServer: 1` — queried directly while the client still believed it had failed |
| App received a simulated failure, not the success | banner shown: *"…could not be confirmed (it may or may not have been saved)"* |
| Initial and retry requests carry the identical UUID | `uuids: ["61750047-…6a77", "61750047-…6a77"]`, `identicalEventUuid: true` |
| Retry does not replay the plant mutation | **`plantWriteRequestsDuringRetry: 0`** — request-log count, not an outcome inference |
| Final database has exactly one event | `finalEventRows: 1` |
| Reloaded timeline displays exactly one event | `uiTimelineItems: 1` |

A `plantRowsWithDescriptor: 2` reading was investigated rather than accepted: `created_at`
showed `04:29:57` and `04:32:23` — two separate test runs 2.5 minutes apart, i.e. leftover
data from the pre-fix run, **not** a retry duplicating a plant. The request-log count of
`0` plant writes during retry is the actual proof. All such rows were then deleted.

## Ruling 4 — single-flight on an established account

Re-run on the established test account so first-run product seeding cannot obscure counts:

```
sharedPromise: true      plantSelectRequests: 1      referenceSelectRequests: 5
productWriteRequests: 0  otherMutations: 1 (= the permitted signed-URL POST above)
```

## Implementation-commit line numbers (ruling 4)

Cite these, not the pre-implementation `main` line numbers. In `app/index.html`:

| Item | Location |
|---|---|
| `removeObjects` compensation helper | after `photoPaths`, just above `uploadPhoto` |
| `uploadPhoto` thumbnail-failure compensation + `strayFile` flag | inside `uploadPhoto` |
| `isDupKey` (conflict-as-success) | immediately after `uploadPhoto` |
| `outcomeOf` (three-way classifier) | immediately after `isDupKey` |
| Phase A state (`partial`, `loaded`, `_resume`, `_loadFlight`) | top of the Alpine `app` component |
| `logEvent` client-generated id | in the component, `logEvent` |
| `showPartial` / `dismissPartial` / `retryPartial` / `secondaryOrWarn` | immediately after `logEvent` |
| `runSecondary` / `refreshAfterResume` | immediately before `logStatusChange` |
| Hard boundary + `_resume` construction | `savePlant`, new-plant branch |
| `loadData` single-flight + `retryLoad` / `dismissLoadError` | in the component, `loadData` |
| Notice markup (3 blocks) + `.pa-notice` CSS | top of `x-show="view==='app'"`; CSS near `.savedbar` |

## Post-addendum state

Baseline restored exactly: **16 plants, 26 journal entries**, `0` `GATE-*` rows, `0` `R3-*`
rows, `0` test Storage objects, `0` notices visible.

## Known wording difference (disclosed, not hidden)

For the **new-plant** row of the A1 matrix the spec's example text is *"…the history event
could not be recorded"*; `runSecondary`'s grouped sentence renders *"…could not be saved"*
(the other three matrix rows, which go through `secondaryOrWarn`, do say "recorded").
Same intent, and ruling 3 governs the required semantics rather than exact wording — flagged
here so the reviewer sees it rather than discovering it.

---

# Round 2 — Codex Gate A FAIL findings, fixed and re-verified (2026-08-02)

Codex returned **FAIL** with one P0 and three P1s. **All four were confirmed real against
the code. No rebuttals were offered.** Fixes and targeted evidence below; the previously
passing boundaries were re-run because the fixes restructured shared code.

## P0 — ambiguous photo-row response could DELETE committed photos

**Confirmed.** Any `photo` insert error triggered deletion of both Storage objects. If the
row had actually committed and only its response was lost, the images belonging to a real
row were destroyed; retry re-uploaded, hit `23505`, deleted them again, and never
converged — duplicate-as-success existed only for events.

**Fix:** never delete on an unresolved outcome. A same-id conflict now *proves* the row is
present; otherwise the code **asks the database** which world it is in before touching
Storage. If the row exists → keep the files and mark it done. If provably absent → clean up.
If the check itself fails → leave the files (a stray file is recoverable; a row pointing at
deleted images is not) and report `unknown`.

**Targeted evidence — the exact injection Codex demanded** (photo row commits, response
lost, via `await` the real request then throw):

```
afterAmbiguousPhotoRow: photoRowCommittedOnServer: 1     ← it really did commit
                        fullFileStillPresent:  true      ← NOT deleted
                        thumbFileStillPresent: true      ← NOT deleted
                        storageDeletesIssued:  0
afterRetry:             photoRows: 1   fullPresent: true   thumbPresent: true
                        coverSet: true  events: 1  plantsWithDescriptor: 1
                        storageDeletesDuringRetry: 0   noticeCleared: true
```

Note: **no notice appeared at all** — the ambiguity resolved itself during the first save,
because the row check found the committed row. Convergence to one row, one full image, one
thumbnail and the intended cover is proven above.

## P1 — "add to existing" bypassed Phase A for photo failures

**Confirmed.** Only the event was protected; photo/cover failures escaped to the red
`Could not update the plant.` for a plant whose quantity had **already** increased — so a
re-tap would have counted it twice.

**Fix:** photos, cover and the note event all go through the resumable pipeline after the
quantity boundary; presentation moved to its own `try`.

```
qtyBefore: 1  qtyAfter: 3  increasedOnce: true
formError: ""                       ← was "Could not update the plant."
notice: "Count updated, but a photo could not be saved."
retry:  qtyUnchangedByRetry: true  plantWritesDuringRetry: 0  photoRows: 1  noticeCleared: true
```

## P1 — a successful status event erased an unresolved category failure

**Confirmed.** `secondaryOrWarn` cleared the shared notice unconditionally on success, so a
category failure and its retry vanished when the status event succeeded.

**Fix:** `secondaryOrWarn` has been **deleted**. There is now exactly one notice builder
(`runSecondary`); the edit branch routes both secondaries through a single `_resume`, so
every unfinished item is named together and cleared together. `saveTileStatus` was migrated
too, removing the cross-operation clobbering risk entirely. A `force` flag was added so an
edit that clears *all* categories still writes the change.

```
statusPersisted: true   statusEventWritten: 1   categoryLinks: 0
noticeStillNamesCategories: true
notice: "Changes saved, but its categories could not be saved."
retry:  categoryLinks: 2   diedEvents: 1 (not duplicated)   noticeCleared: true
```

## P1 — post-boundary work still fed the total-save catch

**Confirmed.** `rememberPicks`, reload and navigation remained inside the outer `try`, so any
throw there produced `Could not save the plant` for a committed row.

**Fix:** presentation runs in its own `try` in both `savePlant` branches and in
`addToExisting`; its catch reports a partial success, never a save failure.

```
plantExists: true   formError: ""   saysCouldNotSave: false
```

**Additional gap closed while verifying:** `reloadPlant()` returns `null` on failure rather
than throwing, so the isolated catch never fired and the user silently landed on the list
with no explanation — the empty-vs-broken ambiguity in miniature. The `null` branch now
shows *"Plant saved, but the app could not refresh the view."* with a retry.

## Regression re-run of the affected boundaries

| Boundary | Result |
|---|---|
| A.1 event fails after new plant | PASS — notice correct, retry: same id, 1 event, **0** plant writes |
| A.3 thumbnail fails | PASS — full image removed; *"a photo could not be saved; the cover photo was not attempted"* |
| A.4 photo row **provably rejected** (server answers) | PASS — **both** objects removed, 0 photo rows |
| A.5 cover fails | PASS — photo + objects intact, **0** Storage deletes; retry sets cover |
| Normal path (no injection) | PASS — 1 photo row, cover set, 2 categories, `acquired`, both objects, **no notice** |

`formError` was empty in every post-boundary case — the hard rule holds across all paths.

**One harness artifact, disclosed:** the batched A.1 reading initially showed only the
stray-file sentence. Cause was the *test*, not the app: the notice element reference was
captured before the retry and `.innerText` read after the DOM had changed. Re-run in
isolation, A.1 renders *"Plant saved, but the history event could not be saved."* with the
stray span hidden (`shown: false`) and `partial.stray` false. Same "doubt the instrument"
trap recorded in the testing-setup notes; the app behaviour was never wrong.

**Post-round-2 state:** baseline restored exactly — **16 plants, 26 journal entries**,
0 test Storage objects, 0 notices visible, `loaded: true`, `loadError: ""`.

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
