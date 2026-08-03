# Gate A evidence — Phase A (A1, A2, A4)

> **HISTORICAL-RESULTS NOTICE (added Round 6, 2026-08-02).** Rounds 1–3 below (and the
> "Deviations" section at the end) describe and test a **write-Retry** feature — a
> resumable pipeline with a Retry button on every partial-success notice. That feature
> was **built, reviewed across rounds 1–4, found fragile (8 findings, none in the
> underlying safety fixes), and removed** by Stephen's decision (`decisions.md`,
> 2026-08-02). Their PASS results are accurate **for the code as it existed when each
> round ran** and are kept as the historical record — they do not describe current
> behavior. **Current contract, verified in Round 4 onward:** partial-success notices
> are append-only and Dismiss-only; the load-error notice is the sole exception and
> keeps Retry. Read "Round 4" for the removal and "Round 5"/"Round 6" for the current,
> operative evidence.

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

---

# Round 3 — Codex round-2 FAIL findings, fixed and re-verified (2026-08-02)

Codex confirmed the P0 fix and the combined category/status fix, then returned **FAIL** on
four further P1s. **All four were confirmed real. No rebuttals.** The root cause of two of
them was architectural, so it was fixed at the root rather than patched.

## Root-cause change: one shared notice → a KEYED LIST

`partial` (one global slot) + `_resume` (one global object) meant every operation
overwrote its predecessor, so a later success silently discarded an earlier unresolved
warning and its retry. Replaced with `partials: []` — each operation owns a key
(`save:<id>`, `edit:<id>`, `add:<id>`, `tile:<id>`, `refresh:<id>`, `detail:<id>`) and can
only ever replace or clear **its own** entry. `runSecondary(resume, label, key)` now takes
its state as parameters instead of reading shared fields. The UI renders one notice per
entry, each with its own Retry/Dismiss.

## P1 #1 — refresh Retry cleared the warning even when refresh failed again

**Confirmed.** Retry callbacks cleared `partial` *before* attempting, and
`refreshAfterResume()` treated a `null` reload as success.

**Fix:** `refreshAfterResume()` now returns **true only when a row actually came back**
(and never throws). `warnRefresh()` owns the notice: its retry clears the entry only on a
proven reload, otherwise it re-posts the same warning. The edit branch's silent
`null`-reload landing is also covered.

```
warningAfterSave:                  ["Plant saved, but the app could not refresh the view."]
warningRemainsAfterFailedRetry:    true      ← was false
clearedAfterSuccessfulRetry:       true
formError:                         ""
editNullRefresh: formError "" · ["Changes saved, but the app could not refresh the view."]
```

## P1 #2 — "add to existing" could still report total failure after quantity was saved

**Confirmed.** The photo-count read sat after the quantity boundary but inside the catch
that writes `Could not update the plant.` The comment calling that catch "pre-boundary"
was inaccurate.

**Fix:** the pre-boundary `try` now contains **only** the quantity update. Everything
after it — count read, resume, `runSecondary` — is secondary, with its own notice and a
retry that reuses a stable event id.

```
qtyBefore: 1  qtyAfter: 3  increasedOnce: true
formError: ""                                   ← was "Could not update the plant."
notice: ["Count updated, but the photo could not be added."]
```

## P1 #3 — status-tile presentation failures crossed the hard boundary

**Confirmed.** `runSecondary` and the timeline reload sat in the same catch that writes
`Could not update status.`

**Fix:** the pre-boundary `try` contains only the status update; the event write and
timeline reload are isolated. Retry never re-applies the status.

```
statusPersisted: true   detailError: ""          ← was "Could not update status."
notice: ["Status saved, but the timeline could not be refreshed."]
clearedAfterRetry: true
```

## P1 #4 — a later successful operation erased an earlier unresolved warning

**Confirmed.** Fixed by the keyed list above.

```
earlierWarning:        ["Plant saved, but the history event could not be saved."]
afterLaterSuccess:     ["Plant saved, but the history event could not be saved."]
earlierStillPresent:   true      ← was false
keys after a fully successful second save: ["save:b52ed9ba-…"]   (only its own cleared)
```

## Deeper bug found while fixing #3 (not in Codex's findings)

`loadDetailEvents()` **discarded its error** (`const {data}=…; data||[]`), so a failed
timeline read rendered as an **empty timeline** — "this plant has no history" and "we
couldn't read its history" are different facts. That is the same empty-vs-broken defect as
A4, in the journal. It now throws, and callers surface it.

**Regression risk this created was audited, not assumed.** Making it throw would have made
three existing callers report a *false* failure for work that had already succeeded:
`saveEvent` → *"Could not save the entry"*, `deleteEvent` → *"Could not delete the event"*,
and `refreshDetail` (unhandled). All three now isolate the post-write reload and report a
partial instead. `openDetail` also guards its loads, so a tap can no longer produce an
unhandled rejection or a silently empty timeline.

## Regression after the refactor

| Boundary | Result |
|---|---|
| A.1 event fails | PASS — same id, 1 event, **0** plant writes during retry, notice cleared |
| A.3 thumbnail fails | PASS — full image removed; *"a photo could not be saved; the cover photo was not attempted"* |
| A.4 photo row provably rejected | PASS — both objects removed, 0 photo rows |
| P0 ambiguous photo row | PASS — **files preserved**, `storageDeletes: 0`, row present |
| Normal path | PASS — 1 photo row, cover set, 2 categories, `acquired`, both objects, **no notice** |

`formError` empty in every post-boundary case.

**Post-round-3 state:** baseline exact — **16 plants, 26 journal entries, 22 photo rows,
44 Storage objects** (2 per photo), 0 notices, `loaded: true`.

*(A stray test event initially survived cleanup because the sweep filtered on the UTC date
while the app writes the local date — found by comparing against the 26-event baseline
rather than trusting the sweep, then removed.)*

---

# Round 4 — scope decision: RETRY REMOVED (Stephen, 2026-08-02)

Codex's round-3 review returned four more P1s, **all four in code written during round 3**.
Rounds 3 and 4 together produced eight findings, and every one lived in the *retry and
notice machinery* wrapped around the safety fixes — not in the safety fixes themselves,
which no round has reversed.

**Stephen's decision: keep every safety guarantee, remove the Retry feature.**

The safety guarantee is *never lie about what was saved*. Retry is a convenience, and its
machinery — stable ids, resumable state, which notice supersedes which, what a retry does
when the subsequent refresh fails — is combinatorial and cannot be verified by hand. It was
consuming the entire risk budget of the effort.

## What changed

| Before | After |
|---|---|
| Keyed notices that replace/clear each other | **Append-only** notices, unique key each, cleared only by the user |
| `retry` callback per notice + `retryPartial()` | removed |
| `clearPartial()` / success-clears-notice | removed — a success posts nothing and clears nothing |
| `runSecondary(r,label,key)` | `runSecondary(r,label)` |
| `warnRefresh` with a self-reposting retry | plain truthful notice |
| `loadDetailEvents` **throws** | records `detailEventsFailed`, returns false, keeps events on screen |

This directly resolves Codex's round-3 findings without new machinery: **#1** (key
collisions) — keys are unique per notice and nothing replaces anything; **#2** (post-retry
refresh ignored) and **#3** (timeline notice replaces event notice) — no retry exists;
**#4** (unisolated `loadDetailEvents` callers) — the throw is reverted, so all eight
callers behave exactly as before and the three round-3 guards were removed as dead code.

The empty-vs-broken guarantee is preserved: the timeline shows *"Couldn't load this
plant's history — what's shown may be out of date."* when a read fails, instead of an
empty timeline. The **load-error** notice keeps its Retry, because re-reading data is a
read-only operation with none of the risk that made secondary-write retries fragile.

## Verification after simplification

| Check | Result |
|---|---|
| A.1 event fails | `"Plant saved, but the history event could not be saved."` · `formError: ""` · 0 events · Dismiss only |
| P0 ambiguous photo row | photo row present, **both files preserved**, `storageDeletes: 0` |
| A.3 thumbnail fails | full image removed · `"a photo could not be saved; the cover photo was not attempted"` |
| Normal path | cover set, 2 categories, `acquired` event, `formError: ""` |
| **Notices accumulate** | 2 unresolved notices before a *fully successful* save → still **2** after (`earlierSurvived: true`) |
| Timeline read fails | `returnedFalse: true`, `detailEventsFailed: true`, existing events kept, **`detailError: ""`** (no false failure), flag clears on success |

Baseline exact: **16 plants, 26 journal entries, 22 photo rows, 44 Storage objects,
0 notices**, `loaded: true`.

*(`retryButtons: 2` in the raw A.1 output counts hidden DOM nodes — the load-error
notice's Retry, which is retained deliberately. The rendered partial-success notice text
ends in "Dismiss" with no Retry, which is the behavioural proof.)*

## Near-miss during this change, disclosed

An over-broad replacement while simplifying `openDetail` **deleted six working methods**
(`closeDetail`, `loadDetailPhotos`, `loadDetailEvents`, `eventPhotos`, `eventPhotoUrl`,
`refreshDetail`). It was caught immediately by the browser verification step
(`loadDetailEvents is not a function`), restored from the previous commit, and confirmed
by diffing the full method inventory against `HEAD` — only `clearPartial` and
`retryPartial` differ, which is the intended removal. No behaviour was lost. Recorded
because it is the same class of self-inflicted regression this round exists to stop, and
because it is the clearest argument yet for Phase D's automated tests.

## Deferred (not lost)

Retry-on-partial-failure returns in **Phase D**, once Playwright can hold the failure
combinations that defeated manual verification. Logged in the plan's deferred table.

---

# Round 5 — Codex round-4 findings, fixed and re-verified (2026-08-02)

Codex's round-4 review accepted the write-Retry removal permanently, found **0 P0s**, and
returned 3 P1s + non-blocking cleanup. **All three P1s confirmed real. No rebuttals.**

## P1 — durable contract still described write-Retry

**Fix:** `tests/specs/phase-a.md`, the Phase A section of `docs/stabilization-plan.md`,
and this evidence file's earlier rounds are **preserved verbatim** — each carries a
superseding banner marking write-Retry clauses as historical rather than rewriting them.
`decisions.md` now has a dated entry recording the full round-1-through-5 arc and
Stephen's decision. `GATE-A-HANDOFF.md` is rewritten fresh for this commit (see below).

## P1 — one plant's history could appear under another plant's name

**Confirmed and reproduced exactly as described.** `loadDetailEvents()` deliberately
*keeps* old data on a same-plant refresh failure (so a blip doesn't blank the screen) —
but `openDetail()` didn't clear that state when switching to a genuinely *different*
plant, so a failed load for Plant B could leave Plant A's events rendered under Plant B's
name. `openJournalEntry()` had the same gap, plus it silently ignored `loadDetailEvents`'s
boolean return — a collection-Journal tap on a plant whose history failed to load just
did nothing, indistinguishable from a dead button.

**Fix:** both functions now clear `detailEvents`/`detailPhotos`/`detailEventsFailed`
**before** loading, but only when actually switching plants (`this.detailPlant.id !==
p.id`) — a same-plant refresh still correctly preserves old data on failure.
`openJournalEntry` also checks the boolean return and posts a truthful notice instead of
silently doing nothing.

**Reproduced and verified (exact boundary Codex demanded):**

```
Open Plant A (1 real event) → inject journal_entry GET failure → open Plant B:
  detailPlantIsB: true
  detailEventsShowsOldPlantAEvents: false   ← the leak, closed
  detailEventsCount: 0
  detailEventsFailed: true
  bannerVisible: true   ("Couldn't load this plant's history — what's shown may be out of date.")

Collection-Journal tap on a real event belonging to a plant whose history load fails:
  sheetOpened: false
  noticeAppeared: true
  lastNotice: "Couldn't open this entry — its plant's history could not be loaded."
```

## P1 — add-to-existing's notice named only the photo, hiding the untried event

**Confirmed.** The photo-count read and the history-event write shared one `try`, so a
count-read failure skipped the event entirely while the notice claimed only the photo
was unfinished — the event's fate went unmentioned in either direction.

**Fix:** `runSecondary` now accepts a `precheck` list — items that were never attempted
because their own setup failed before the resumable pipeline could run (the existing
"not attempted" outcome, reused rather than reinvented). The count-read failure now
marks the photo `skipped` via `precheck` and proceeds to the event independently.

**Reproduced and verified:**

```
Quantity 1→2 (increased exactly once) · photo rows: 0 (never attempted, correctly)
event WAS written (proceeded independently) · formError: ""
notice: "Count updated, but a photo was not attempted."   (event absent — it succeeded)
```

## Non-blocking cleanup, done

- `refreshAfterResume` deleted — verified zero callers before removal (`grep` showed only
  its own definition).
- Six stale comments referencing the removed retry mechanism (`_resume`, "with a working
  Retry", "Retry never re-applies…") rewritten to describe current behavior.

## Regression + cleanup

A.1, P0-ambiguous, and the normal path (with 2 pre-existing unresolved notices left
untouched by a fully successful save) all re-verified passing. One test artifact —
a note event + quantity bump on a **real, non-prefixed** plant from the add-to-existing
test — was found by comparing against the 26-event baseline (not assumed clean), then
reverted precisely (event deleted, quantity restored to its original value).

**Post-round-5 state:** baseline exact — **16 plants, 26 journal entries, 22 photo rows,
44 Storage objects**, 0 notices, `loaded: true`.

---

# Round 6 — Codex round-5 finding, fixed and re-verified (2026-08-02)

Codex's round-5 review found **0 P0s**, confirmed all three round-5 fixes, and returned
**one P1**: the collection-wide Journal tab couldn't recover after one failed history
load. **Confirmed real, exactly as reproduced. No rebuttal.**

## P1 — Journal couldn't recover after one failed load

**Root cause.** `openJournalEntry`'s guard (`!this.detailPlant || this.detailPlant.id
!== plantId`) conflated two different things: *"already viewing this plant"* and
*"already viewing this plant AND its last load succeeded."* Once the first (failing) tap
set `this.detailPlant = B`, every subsequent tap on a Plant B entry saw the id already
match and skipped loading forever — even after the connection recovered. The tap looked
like a permanently dead button.

**Fix:** the guard now also re-loads when `this.detailEventsFailed` is true — the exact
flag that already exists to distinguish "no history" from "couldn't read the history."
A same-plant retry-after-failure does **not** clear `detailEvents`/`detailPhotos` first
(only a genuine plant-switch does, per Round 5); there is nothing to protect against
since the prior attempt never populated them.

**Reproduced exactly as specified, with request counts (the harness itself had a bug on
the first attempt — a fetch wrapper meant to "restore the connection" fully replaced the
counting wrapper, so the second tap's reads were invisible; corrected by keeping one
wrapper active throughout and toggling only whether it injects a failure):**

```
Plant A cached (1 event) → tap a Plant B event, injected failure:
  reads: 1   sheetOpen: false   detailEventsFailed: true
  warning: "Couldn't open this entry — its plant's history could not be loaded."

Dismiss, connection restored, tap the SAME Plant B event again:
  reads: 1   ← a FRESH read, not a no-op          sheetOpen: true
  detailEventsFailed: false   matchesRequestedEvent: true

Tap a DIFFERENT, already-successfully-cached entry on Plant B:
  reads: 0   ← correctly uses the cache, no unnecessary re-fetch   sheetOpen: true
```

**`openDetail` re-checked too** (same guard pattern, same fix applies): switching from
Plant A to a failing Plant B still shows zero of Plant A's events
(`showsOldPlantAEvents: false`), and calling `openDetail(B)` again after the connection
recovers clears `detailEventsFailed` and loads normally.

## Non-blocking cleanup, done

- This evidence file now opens with a historical-results notice (see the top of this
  file) marking rounds 1–3's write-Retry testing as accurate-for-its-time, not current.
- The "Deviations" section's structural-choice item is corrected to state plainly that
  the Retry half is gone; the per-step pipeline itself remains.
- Three more stale code comments (`app/index.html`, the `isDupKey` doc comment and two
  others) rewritten to describe the still-real idempotency guarantee without implying a
  live Retry feature.

## Post-round-6 state

No data-mutating paths were touched this round (`openDetail`/`openJournalEntry` are
read-only), so no test cleanup was required. Baseline unchanged and confirmed exact:
**16 plants, 26 journal entries, 22 photo rows, 44 Storage objects**, 0 notices,
`loaded: true`.

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
3. **Structural choice, PARTIALLY SUPERSEDED (Round 6).** As originally written: the
   post-plant tail of `savePlant` was a *resumable* pipeline (`_resume` + `runSecondary`)
   with per-step done-flags, retaining photo blobs so a Retry never asked the user to
   re-pick an image. **The Retry half is gone** (Round 4). What remains and is still
   accurate: `runSecondary` still runs as a per-step pipeline with done-flags — it just
   reports the outcome once and stops, with no retry callback attached. Photo blobs are
   still held for the duration of that single call (not persisted for a later retry).
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
