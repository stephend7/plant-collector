# Phase A acceptance specification — safety fixes A1, A2, A4

**Status:** Assertions-first specification for Claude Code implementation and Gate A review.
**Checkout reviewed:** `/Users/stephendavis/Documents/2- Plant Collector DB`, branch `main`.
**Scope:** Outcomes for Phase A1 (event failures), A2 (post-plant partial failures and photo compensation), and A4 (load errors and single-flight startup). A3 is out of scope.
**Authority:** `docs/stabilization-plan.md:132-158`, `docs/stabilization-plan.md:169-196`, and the Gate A review focus at `docs/stabilization-plan.md:515-548`.

This document specifies observable outcomes, not implementation structure. Claude may choose the internal state shape and function boundaries, but Gate A passes only if every assertion below is demonstrated at the exact failure boundary.

## Evidence labels

- **OBSERVED** describes the current main-branch source read while writing this specification.
- **REQUIRED** is a normative Phase A acceptance condition; it is not a claim that current code already behaves this way.
- **INFERENCE** identifies something not proven from the inspected files or a behavior that depends on the Supabase/browser runtime. Gate A must replace each relevant inference with empirical evidence.

## Source facts that constrain the acceptance outcomes

1. **OBSERVED:** A new-plant save inserts the plant row first, then uploads each photo, inserts each photo row, sets a cover, records an acquired event, and attaches categories (`app/index.html:3344-3362`).
2. **OBSERVED:** Any exception escaping that sequence currently reaches a generic form error that may say `Could not save the plant.` (`app/index.html:3389-3394`).
3. **OBSERVED:** Full-image upload precedes thumbnail upload, and the current helper performs no compensation when the second upload fails (`app/index.html:2299-2305`).
4. **OBSERVED:** Event failures are currently swallowed after a successful full-form status edit, new-plant insert, add-to-existing quantity update, and detail-tile status update (`app/index.html:3329-3337`, `app/index.html:3344-3361`, `app/index.html:3423-3427`, `app/index.html:3553-3563`).
5. **OBSERVED:** `logEvent` currently lets the database assign the event ID; the inserted row does not contain a client-supplied ID (`app/index.html:3510-3519`). Phase A requires one logical event identity to survive all retries (`docs/stabilization-plan.md:142-146`).
6. **OBSERVED:** The existing partial-success visual is amber and already has a dismiss link (`app/index.html:110-112`, `app/index.html:431-434`, `app/index.html:712-717`). Phase A requires new error states to use amber, offer dismissal, and not auto-hide quickly (`docs/stabilization-plan.md:139-141`, `docs/stabilization-plan.md:496-497`).
7. **OBSERVED:** `init()` can call `loadData()` from both the auth-state callback and `getSession()` (`app/index.html:2873-2882`). `loadProducts()` already demonstrates a single-flight contract (`app/index.html:2937-2949`).
8. **OBSERVED:** Reference query errors are not checked before empty-array fallbacks, while a plant query error is only logged to the console (`app/index.html:2924-2935`, `app/index.html:2964-2967`). The normal UI interprets `plants.length===0` as a real empty collection (`app/index.html:1422-1425`, `app/index.html:1542`).

## Global partial-success contract

These assertions apply to Gate A boundaries 1–5 and 8, and to every A1 call site listed later.

### Primary-save truth

- **REQUIRED:** Before the primary mutation succeeds, an actual primary-save failure may be reported as a failure. After the primary mutation succeeds, every later failure is a **partial success**, never a primary-save failure. This is the Phase A hard rule (`docs/stabilization-plan.md:148-158`).
- **REQUIRED:** For a new plant, the hard boundary is the successful creation of the plant row (`app/index.html:3344-3346`). After that response, no banner, form error, dialog, toast, accessible name, or retry label may say or imply that the plant was not saved.
- **REQUIRED:** For an existing-plant edit, add-to-existing action, or status-tile change, the equivalent boundary is the successful plant update (`app/index.html:3329-3330`, `app/index.html:3423-3426`, `app/index.html:3553-3559`). A later event/photo/category/cover failure must not claim that the already-applied update failed.
- **REQUIRED:** After a post-boundary failure, the saved plant must be discoverable after a fresh database read under the same plant ID. Retrying must not insert a second plant row or repeat an already-successful quantity/status change.
- **REQUIRED:** The red form-error outcome currently rendered at `app/index.html:660` and populated by `app/index.html:3389-3394` must not be used to describe any post-plant partial success.

### Banner contract

- **REQUIRED:** A partial-success notice is visibly amber, not green and not styled as a total-failure error. The existing amber palette is observable at `app/index.html:110-112`.
- **REQUIRED:** The notice remains until the user explicitly chooses **Retry** or **Dismiss**. It must not use the current 15- or 20-second success timers at `app/index.html:3374-3376` and `app/index.html:3457-3459`.
- **REQUIRED:** The visible actions are labeled **Retry** and **Dismiss**. They must be keyboard-operable buttons or links with equivalent accessible names.
- **REQUIRED:** **Dismiss** hides the notice and performs no database write, Storage write/delete, primary-save replay, or secondary-operation retry.
- **REQUIRED:** If **Retry** fails again, the same amber notice remains, the user may retry again, and the truthful saved/unsaved description is updated if cleanup state changes.
- **REQUIRED:** If **Retry** succeeds, the partial-success notice clears and the reloaded UI shows the completed secondary result. A green success banner is optional; absence of one does not fail Gate A.
- **REQUIRED:** The notice must appear on the screen where the save flow leaves the user. Current flows may land on the plant detail screen or remain on the add form (`app/index.html:3365-3387`, `app/index.html:3446-3459`); the warning must not flash on an intermediate screen and disappear during navigation.

### Retry scope

- **REQUIRED:** Retry resumes only unfinished secondary work for the already-saved plant. It must not call the new-plant insert again, repeat the already-successful plant update, or replay already-successful photo rows, cover changes, categories, or events.
- **REQUIRED:** A retained local photo must remain retryable without requiring the user to choose the source image again after a thumbnail, photo-row, or cover failure. Dismissing the warning may abandon that immediate retry opportunity, but it must not delete the already-saved plant.
- **REQUIRED:** Every event retry reuses one logical event identity. A response-lost retry must converge to one event, as specified at `docs/stabilization-plan.md:142-146`.

### Storage cleanup contract

- **REQUIRED:** Cleanup assertions concern the deterministic full and thumbnail paths formed by the upload flow currently visible at `app/index.html:2299-2305`.
- **REQUIRED:** When compensation succeeds, Storage inspection must prove that every object which lacks a corresponding accepted photo row has been removed.
- **REQUIRED:** If a cleanup request fails or its outcome is unknown, the amber notice must add the semantic warning: **A stray photo file may remain in storage.** It may use equivalent plain wording, but it must mention the possible leftover file; a console message alone fails Gate A (`docs/stabilization-plan.md:155-158`).
- **REQUIRED:** A cleanup failure must not replace the primary truth: the plant remains saved. The notice must communicate both facts.
- **REQUIRED:** Retrying after a cleanup failure must converge to one full object, one thumbnail object, and one photo row for the intended photo—never duplicate logical photos or differently named leftover objects.

## A1 call-site matrix

Gate A boundary 1 must be exercised for every existing A1 source, because each source has a different primary mutation and destination screen.

| A1 source | What must already be saved | What must not yet be saved when the forced event failure is returned | Required user-visible intent | Retry result |
|---|---|---|---|---|
| New plant | One new plant row with the submitted fields; all independently successful photo, cover, and category work remains saved (`app/index.html:3344-3362`) | The acquired event for this save attempt | **Plant saved, but the history event could not be recorded.** Amber; **Retry**, **Dismiss** | Retry attempts only that acquired event; after success exactly one acquired event for the logical attempt is visible after reload |
| Full edit with lifecycle change | The edited plant fields and new lifecycle status (`app/index.html:3324-3330`) | The corresponding status-history event (`app/index.html:3333-3337`) | **Changes saved, but the history event could not be recorded.** Amber; **Retry**, **Dismiss** | Retry writes only the status-history event; it does not apply the plant edit again |
| Add to existing | The existing plant's quantity is increased exactly once (`app/index.html:3423-3426`) | The count-change note event (`app/index.html:3427`) | **Count updated, but the history event could not be recorded.** Amber; **Retry**, **Dismiss** | Retry writes only the count-change note; quantity does not increase again |
| Detail status tile | The selected lifecycle status is persisted (`app/index.html:3553-3559`) | The corresponding status-history event (`app/index.html:3559-3562`) | **Status saved, but the history event could not be recorded.** Amber; **Retry**, **Dismiss** | Retry writes only the status-history event; status is not toggled or rewritten as a new user action |

- **REQUIRED:** All four rows obey the global hard rule and event-idempotency contract.
- **INFERENCE:** The current Supabase client may return different error shapes for a rejected insert, a committed insert with a lost response, and a primary-key conflict. That behavior was not executed while writing this spec; Gate A must demonstrate the accepted result for each simulated response shape.

## Gate A boundary specifications

### Gate A.1 — Event insert fails after the primary plant mutation

**Injection point:** Force the `journal_entry` insert used by `logEvent` to fail after the relevant plant insert/update has succeeded (`app/index.html:3510-3519`). Run the four A1 matrix cases above; a generic offline toggle is insufficient (`docs/stabilization-plan.md:186-194`).

Assertions:

1. **REQUIRED — saved:** The primary plant mutation named in the matrix is persisted under its original plant ID. Any earlier successful secondary operations remain persisted.
2. **REQUIRED — not saved:** No journal entry exists for the failed event attempt when the injected failure is known to occur before server commit.
3. **REQUIRED — visible:** The destination screen shows the matrix-specific amber text intent with **Retry** and **Dismiss**. It does not show `Could not save the plant`, `Could not update the plant`, or `Could not update status` after the primary mutation succeeded; those current generic paths are visible at `app/index.html:3389-3394`, `app/index.html:3460-3462`, and `app/index.html:3563`.
4. **REQUIRED — retry:** Clicking **Retry** makes no plant insert/update request. It retries only the missing event with the same logical event ID. Success leaves exactly one matching event in the database and exactly one timeline item after a fresh event reload (`app/index.html:3477-3489`).
5. **REQUIRED — Storage:** No Storage cleanup or upload occurs in an event-only failure or retry. Any Storage request makes this assertion fail.
6. **REQUIRED — retry failure:** A second known-before-commit event failure leaves the primary mutation intact and the amber notice actionable.

### Gate A.2 — Category attachment fails after a new plant save

**Fixture:** Save one new plant with at least two selected categories and, optionally, one photo. Force the category-link insert to fail only after the plant, any selected photo, cover, and acquired event have succeeded. The attachment call follows those writes in the current new-plant sequence (`app/index.html:3344-3362`).

Assertions:

1. **REQUIRED — saved:** Exactly one plant row exists with the submitted plant fields. The successfully completed photo row/objects, cover link, and acquired event remain saved.
2. **REQUIRED — not saved:** The requested category set is not falsely reported as attached. For this new-plant fixture, no requested `plant_category` links exist after the forced pre-commit attachment failure.
3. **REQUIRED — visible:** An amber notice communicates **Plant saved, but its categories could not be attached.** It offers **Retry** and **Dismiss** and never presents the generic total-save error at `app/index.html:3389-3394`.
4. **REQUIRED — retry:** **Retry** attempts only to make the saved plant's category links equal the originally requested set. It does not reinsert the plant, reupload photos, reset the cover, or insert a second acquired event. After success, a fresh database read returns exactly the requested unique category links; the composite relationship is defined at `app/schema.sql:172-178`.
5. **REQUIRED — Storage:** No photo object is deleted or uploaded because a category attachment failed. Storage request count for failure handling and retry is zero.
6. **REQUIRED — cleanup failure:** Storage cleanup is not applicable. The banner must not claim that a stray photo file may remain unless an independent photo cleanup actually failed in the same save attempt.
7. **INFERENCE:** A single PostgREST batch insert of category links is expected to be atomic, but this was not verified. Gate A should force a pre-commit rejection and inspect the actual `plant_category` rows rather than assume atomicity. The current helper deletes first and then inserts (`app/index.html:4202-4204`), so edited-plant category replacement remains non-atomic and is explicitly outside Phase A's final-atomicity promise (`docs/stabilization-plan.md:627-638`).

### Gate A.3 — Thumbnail upload fails after the full image upload

**Fixture:** Save a new plant with exactly one pending photo. Allow the full image upload to succeed, then force the thumbnail upload to fail at the second Storage call (`app/index.html:2299-2305`).

Assertions:

1. **REQUIRED — saved:** Exactly one plant row exists with the submitted fields (`app/index.html:3344-3346`).
2. **REQUIRED — not saved:** No photo metadata row exists for the failed photo; no cover points to it; acquisition-event and category work that had not yet been reached must not be falsely reported as complete. The current ordering is photo upload → photo row → cover → event/categories (`app/index.html:3350-3362`).
3. **REQUIRED — cleanup success:** The successful full-image object is removed. Neither the full path nor thumbnail path exists in Storage after compensation.
4. **REQUIRED — visible:** The amber notice communicates **Plant saved, but a photo could not be added.** It offers **Retry** and **Dismiss** and does not say that the plant failed to save.
5. **REQUIRED — retry:** **Retry** completes the failed photo and any still-unfinished secondary work for the same plant, without another plant insert and without asking the user to choose the image again. After success there is exactly one photo row, one full object, one thumbnail object, the intended cover link, and no duplicate acquired event or category link.
6. **REQUIRED — cleanup failure variant:** Force removal of the full object to fail. The same amber notice additionally communicates **A stray photo file may remain in storage.** The saved plant remains visible. The warning is not console-only.
7. **REQUIRED — retry after cleanup failure:** A successful retry converges to exactly the expected full and thumbnail paths and one photo row. The stray-file warning clears only after the final Storage state is known to be clean.

### Gate A.4 — Photo-row insert fails after both files upload

**Fixture:** Save a new plant with exactly one pending photo. Let both Storage uploads succeed, then force the `photo` table insert to fail at `app/index.html:3352-3354`.

Assertions:

1. **REQUIRED — saved:** Exactly one plant row exists with the submitted fields.
2. **REQUIRED — not saved:** No photo metadata row exists for the rejected insert; no cover points to the failed photo; later acquired-event/category work is not falsely reported as complete (`app/index.html:3350-3362`).
3. **REQUIRED — cleanup success:** Both the full-image and thumbnail objects are removed from Storage because neither has an accepted photo row (`docs/stabilization-plan.md:155-158`).
4. **REQUIRED — visible:** The amber notice communicates **Plant saved, but a photo could not be added.** It offers **Retry** and **Dismiss** and never claims the plant failed.
5. **REQUIRED — retry:** **Retry** completes the photo and still-unfinished secondary work against the existing plant. A fresh read shows exactly one photo row, one full object, one thumbnail object, the intended cover, and no duplicate plant/event/category records.
6. **REQUIRED — cleanup failure variants:** Test failure to remove the full object, the thumbnail object, and both. Each case keeps the primary saved truth and adds **A stray photo file may remain in storage.** Storage inspection, not the removal request alone, determines the observed leftover state.
7. **INFERENCE:** Supabase Storage deletion response/error semantics were not executed while writing this spec. Gate A must prove that a returned cleanup error and a thrown cleanup error both reach the visible stray-file warning.

### Gate A.5 — Cover update fails after the photo row is inserted

**Fixture:** Save a new plant with exactly one photo. Allow both Storage objects and the photo metadata row to save, then force the plant `cover_photo_id` update to fail at `app/index.html:3356-3359`.

Assertions:

1. **REQUIRED — saved:** The plant row, photo row, full image, and thumbnail are saved and mutually consistent.
2. **REQUIRED — not saved:** The plant does not point to the intended cover ID. Later acquired-event/category work that had not yet been reached is not falsely reported as complete (`app/index.html:3356-3362`).
3. **REQUIRED — visible:** The amber notice communicates **Plant and photo saved, but the cover photo could not be set.** It offers **Retry** and **Dismiss** and does not say the plant or photo failed to save.
4. **REQUIRED — retry:** **Retry** sets the intended existing photo as cover and completes only still-unfinished secondary work. It does not reinsert the plant or photo row and does not reupload either Storage object. After success, `cover_photo_id` equals the existing photo ID; the foreign-key relationship is defined at `app/schema.sql:157-160`.
5. **REQUIRED — Storage:** No Storage cleanup is appropriate because the photo row and both objects are valid. Any delete or reupload request during cover-only retry fails this assertion.
6. **REQUIRED — cleanup failure:** Not applicable; the banner must not mention a stray file for a cover-only failure.

### Gate A.6 — Collection load fails

**Fixture:** Use a data source known to contain at least one plant. Separately force (a) one reference-list query in `loadData` to fail and (b) the plant query in `loadPlants` to fail (`app/index.html:2924-2935`, `app/index.html:2964-2972`).

Assertions:

1. **REQUIRED — saved:** No database or Storage mutation occurs. Existing server data remains unchanged.
2. **REQUIRED — not presented as saved/empty:** The application does not enter or expose the normal empty-collection messages `Your collection is empty` or `No plants yet` (`app/index.html:1422-1425`, `app/index.html:1542`). A failed load and a successful zero-row load are distinct states.
3. **REQUIRED — visible:** An amber load-error state communicates **Couldn't load your collection.** It offers **Retry** and **Dismiss**. One generic Phase A error is acceptable; richer offline/auth/schema/photo-signing taxonomy is deferred (`docs/stabilization-plan.md:169-178`, `docs/stabilization-plan.md:627-639`).
4. **REQUIRED — dismiss:** **Dismiss** hides the expanded notice but must not reveal the normal empty-collection onboarding state. The collection remains marked not successfully loaded and retains a visible way to retry.
5. **REQUIRED — retry:** **Retry** starts one new collection load. It performs no writes. On success it clears the load-error state and renders the known fixture plant; on failure it keeps the truthful error state and actions.
6. **REQUIRED — stale data:** If a refresh load fails after plants were previously displayed, the app must not replace those known plants with an asserted empty collection. It may keep the stale data with an amber warning or withhold the view, but it must clearly say the refresh/load failed.
7. **REQUIRED — Storage:** No Storage delete/upload occurs. Signed-URL reads are not Storage mutations and are outside this boundary unless they are the injected failure.
8. **INFERENCE:** The exact response behavior for each Supabase reference query was not run while writing this spec. Gate A must inject an actual `{ error }` result and verify the shared load-error state, not rely only on a thrown JavaScript exception.

### Gate A.7 — Double startup is attempted; single-flight holds

**Fixture:** Begin a cold page load with one already-authenticated user. Hold the first collection request open long enough for both the auth-state and `getSession()` startup paths to attempt loading (`app/index.html:2873-2882`).

Assertions:

1. **REQUIRED — load count:** Exactly one logical `loadData` execution is in flight for that user/session. Both startup callers share its result rather than launching duplicate pipelines. The intended model is the existing `loadProducts` single-flight behavior at `app/index.html:2937-2949`.
2. **REQUIRED — observable proof:** Capture both (a) a spy/counter on the logical collection-load entry and (b) browser network requests. The entry counter is exactly `1`, the main `plant` collection-select request count is exactly `1`, and each reference-list select initiated by that logical load occurs exactly once. Exclude update-check requests, signed-photo URL requests, and later user-triggered reloads from this count (`app/index.html:2883-2895`, `app/index.html:2968-2972`).
3. **REQUIRED — saved/not saved:** Startup performs no plant, journal, category, photo, or Storage mutation. Existing data is read once and rendered once.
4. **REQUIRED — visible:** A successful coalesced startup shows the normal collection with no partial-success or load-error banner. The user must not see a duplicate flash, count change, or reset caused by the second startup callback.
5. **REQUIRED — retry:** There is no Retry action on a successful startup. If the single shared load fails, Gate A.6 applies; one explicit user Retry is allowed to start exactly one new logical load. Multiple rapid Retry activations while that retry is in flight must coalesce rather than overlap.
6. **REQUIRED — Storage:** No Storage cleanup occurs.
7. **INFERENCE:** The inspected code proves two call sites exist, but not that both Supabase callbacks fire on every SDK/browser combination or in a fixed order. Gate A must force both callers in a controlled test and additionally record the real cold-start request count.

### Gate A.8 — Ambiguous event response; retry creates exactly one event

**Fixture:** Use any A1 matrix action, preferably a new plant's acquired event. Allow the `journal_entry` insert to commit on the server, then suppress or replace the success response so the client observes a failure. The ambiguity and required idempotency are explicit at `docs/stabilization-plan.md:142-146`.

Assertions:

1. **REQUIRED — saved:** The primary plant mutation is persisted. The first event insert is also persisted even though the client did not receive confirmation.
2. **REQUIRED — not duplicated before retry:** Exactly one matching journal row exists before the user presses **Retry**.
3. **REQUIRED — visible:** Because the client cannot know the server committed, it truthfully shows the same amber matrix-specific **history event could not be confirmed/recorded** intent with **Retry** and **Dismiss**. It still states that the plant/count/status change was saved.
4. **REQUIRED — stable identity:** The retry represents the same logical event, not a new event. The event ID observed in the first request and retry request is identical, satisfying the identity requirement at `docs/stabilization-plan.md:142-146`.
5. **REQUIRED — conflict-as-success outcome:** If retry receives a duplicate-primary-key result for that same event ID, the UI treats the event as successfully present, clears the partial-success warning, and does not ask the user to retry again.
6. **REQUIRED — exact database observation:** After retry and a fresh query, exactly one `journal_entry` row exists for the stable event ID. The matching plant ID, event type, entry date, body, and cause equal the intended event values assembled by `app/index.html:3510-3530`.
7. **REQUIRED — exact UI observation:** After reloading the plant's events, exactly one matching timeline item is rendered; event reload is sourced by `app/index.html:3477-3489`. Counting only visible cards without the database assertion is insufficient, and counting only database rows without the UI assertion is insufficient.
8. **REQUIRED — no primary replay:** Retry creates no additional plant row and performs no repeated quantity/status mutation. For add-to-existing, quantity increases once total; for a status change, one status transition is present.
9. **REQUIRED — Storage:** No Storage upload, delete, or cleanup occurs during ambiguous event handling.
10. **INFERENCE:** Whether Supabase reports the same-ID retry as a conventional primary-key error or another response shape was not verified. The acceptance condition is the observable convergence to one event and a cleared warning, regardless of response encoding.

## Normal-path regression assertion

Gate A also requires an uninjected control save because the boundary list explicitly says normal saves still work (`docs/stabilization-plan.md:193-194`).

1. **REQUIRED:** A normal new-plant save creates exactly one plant, the requested photos and categories, one acquired event, and the intended cover.
2. **REQUIRED:** No amber partial-success or load-error notice appears.
3. **REQUIRED:** A normal edit status change, add-to-existing action, and status-tile change each produce their one expected history event.
4. **REQUIRED:** A normal cold start performs one logical collection load and renders the collection.

## Gate A evidence checklist

Claude's handoff for the blocking Gate A review must provide evidence from the named implementation checkout, not a prose claim (`AGENTS.md:23-46`, `docs/stabilization-plan.md:523-532`). For each boundary, record:

- the exact injected request and whether it failed before commit or after commit;
- the database rows present before failure, after failure, and after Retry;
- the Storage paths present before failure, after compensation, and after Retry;
- a screenshot or browser assertion of amber text intent plus **Retry** and **Dismiss**;
- request counts proving no repeated plant insert/update and no unintended Storage operation;
- for ambiguous events, both the stable event ID in requests and the final database/UI count of exactly one;
- for startup, the logical entry counter and network count proving one collection load;
- an uninjected normal-path result.

Any behavior not empirically demonstrated remains **INFERENCE** and cannot be used as proof that Gate A passed.
