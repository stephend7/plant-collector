# Gate A handoff — Round 5, ready for review

**To:** Codex (independent reviewer) · **From:** Claude Code (implementer) · **Date:** 2026-08-02
**Decision requested:** PASS / CONDITIONAL / FAIL on Gate A, per `docs/stabilization-plan.md`
→ "Cross-model review gates". Nothing is deployed; `app-build` is deliberately unbumped.
**Scope note:** write-Retry is permanently out of scope (your round 4 verdict accepted
this; do not re-request it). Load-error Retry remains.

---

## 1. Where to look

**Review this path — NOT the main checkout.**

```
/Users/stephendavis/Documents/2- Plant Collector DB/.claude/worktrees/busy-greider-dc4153
Branch: phase-a-safety-fixes
Commit under review: 0d13b5c   (previous review commit was dce0601)
```

Read in this order: `tests/evidence/phase-a-gate-a.md` → **"Round 5"** section (the other
rounds are historical record, preserved verbatim) → `app/index.html` diff:
`git diff dce0601..0d13b5c -- app/index.html`.

**Note on commit hygiene:** `0d13b5c` was first created under an incorrect message (round
3's text, pasted in error) and amended immediately, before this handoff or any review
request went out. Recorded in the commit body and here rather than silently.

## 2. Your three round-4 findings — all fixed and re-verified

**#1 Reconcile the durable contract.** `tests/specs/phase-a.md` and the Phase A section
of `docs/stabilization-plan.md` are preserved **verbatim** — each now opens with a
superseding banner marking every write-Retry clause as historical, not current behavior.
`decisions.md` has a new dated entry recording the full round 1–5 arc and Stephen's
decision. This file is the rewritten handoff for the new commit.

**#2 Cross-plant history leakage + silent Journal-tap failure.** `openDetail()` and
`openJournalEntry()` now clear `detailEvents`/`detailPhotos`/`detailEventsFailed` before
loading — but **only when actually switching plants** (`detailPlant.id !== p.id`), so a
same-plant refresh still correctly preserves old data on a transient failure.
`openJournalEntry()` also checks `loadDetailEvents`'s boolean return and posts a truthful
notice instead of silently doing nothing.

Reproduced exactly as you specified:
```
Open Plant A (1 real event) → inject a journal_entry read failure → open Plant B:
  detailPlantIsB: true
  detailEventsShowsOldPlantAEvents: false   ← the leak, closed
  detailEventsFailed: true
  bannerVisible: true
Collection-Journal tap on a real event whose plant's load fails:
  sheetOpened: false
  lastNotice: "Couldn't open this entry — its plant's history could not be loaded."
```

**#3 add-to-existing's notice named only the photo.** `runSecondary` now accepts a
`precheck` list — items never attempted because their own setup failed (reusing the
existing `'skipped'` outcome, not a new one). A count-read failure marks the photo
skipped and the event now proceeds **independently**.

Reproduced:
```
quantity 1→2 (once) · photo rows: 0 (never attempted) · EVENT WAS WRITTEN
notice: "Count updated, but a photo was not attempted."   (event absent — it succeeded)
```

## 3. Non-blocking cleanup — done

- `refreshAfterResume` deleted (verified zero callers via `grep` before removal).
- Six stale comments referencing the removed retry mechanism rewritten to describe
  current behavior.

## 4. Regression

A.1, P0-ambiguous-photo-row, and the normal-path control all re-verified passing.
`formError` empty in every post-boundary case. Two pre-existing unresolved notices
survived a subsequent *fully successful* save (append-only contract holds).

## 5. Verification conditions (unchanged from prior rounds)

Real app, real Supabase backend, throwaway test account `stephenwd@sbcglobal.net`
(`…f0b4b7`), RLS-isolated from Stephen's real collection. Failure injection is
per-request at the exact boundary via a wrapped `window.fetch`, never a blanket offline
toggle. Assertions query PostgREST directly with the session JWT, independent of the
app's own code.

**Baseline discipline, honestly kept:** one test artifact — a note event + quantity
increment on a **real, non-prefixed** plant from the add-to-existing test — survived
first cleanup. Found by comparing the post-test count against the known 26-event
baseline rather than assuming the cleanup sweep was complete, then reverted precisely
(event deleted, quantity restored). **Final state: 16 plants, 26 journal entries, 22
photo rows, 44 Storage objects, 0 notices** — exact match to baseline.

## 6. What happens after your verdict

- **PASS** → Stephen approves, `app-build` is bumped, branch merges to `main`, push
  deploys, Stephen confirms on his iPhone.
- **CONDITIONAL / FAIL** → findings by severity with `file:line` at `0d13b5c`. Claude
  fixes, evidence-backed rebuts, or explicitly defers each; Stephen decides anything
  unresolved.

Nothing ships without your verdict and Stephen's approval.
