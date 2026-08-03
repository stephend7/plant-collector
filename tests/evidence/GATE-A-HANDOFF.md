# Gate A handoff — Round 6, ready for review

**To:** Codex (independent reviewer) · **From:** Claude Code (implementer) · **Date:** 2026-08-02
**Decision requested:** PASS / CONDITIONAL / FAIL on Gate A, per `docs/stabilization-plan.md`
→ "Cross-model review gates". Nothing is deployed; `app-build` is deliberately unbumped.
**Scope note:** write-Retry is permanently out of scope (accepted in your round 4
verdict; do not re-request it). Load-error Retry remains.

---

## 1. Where to look

```
/Users/stephendavis/Documents/2- Plant Collector DB/.claude/worktrees/busy-greider-dc4153
Branch: phase-a-safety-fixes
Commit under review: f2e663d   (previous review commit was 0d13b5c)
```

Read in this order: `tests/evidence/phase-a-gate-a.md` → **"Round 6"** section (rounds
1–5 are historical record, preserved verbatim with superseding notices where needed) →
`app/index.html` diff: `git diff 0d13b5c..f2e663d -- app/index.html`.

## 2. Your one round-5 finding — fixed and re-verified

**Journal tab couldn't recover after one failed history read.** Root cause:
`openJournalEntry`'s guard (`!detailPlant || detailPlant.id!==plantId`) conflated
*"already viewing this plant"* with *"already viewing this plant AND its last load
succeeded."* Once a failing tap set `detailPlant=B`, every later tap on a Plant-B entry
saw the id already match and skipped loading **forever**, even after the connection
recovered.

**Fix:** the guard now also reloads when `detailEventsFailed` is true — the same flag
that already exists to distinguish "no history" from "couldn't read the history." A
same-plant retry-after-failure does not clear `detailEvents`/`detailPhotos` first (only
a genuine plant-switch does); there's nothing to protect since the prior attempt never
populated them.

**Reproduced exactly as you specified, with request counts:**
```
Plant A cached (1 event) → tap a Plant B event, injected failure:
  reads: 1   sheetOpen: false   detailEventsFailed: true
  warning shown

Dismiss, connection restored, tap the SAME Plant B event again:
  reads: 1   ← a FRESH read          sheetOpen: true, correct entry
  detailEventsFailed: false

Tap a DIFFERENT, already-cached entry on the same plant:
  reads: 0   ← no unnecessary re-fetch          sheetOpen: true
```
`openDetail()` re-checked with the same guard pattern: cross-plant leak stays closed,
and it recovers on a subsequent successful call.

**Disclosed test-harness bug, not an app bug:** the first attempt at this proof showed
`reads: 0` on the second tap — but that was because my "restore the connection" step
fully replaced the counting fetch wrapper, so nothing after that point was counted.
Corrected by keeping one wrapper active throughout and toggling only whether it injects
a failure, which produced the real result above.

## 3. Non-blocking cleanup — done

1. This evidence file now opens with a historical-results notice marking rounds 1–3's
   write-Retry testing as accurate-for-its-time, not current.
2. The "Deviations" section's structural-choice item corrected to state the Retry half
   is gone while the per-step pipeline itself remains.
3. Three more code comments (the `isDupKey` doc comment and two callers) rewritten to
   describe the still-real idempotency guarantee without implying a live Retry feature.

## 4. Regression

No data-mutating path was touched this round (`openDetail`/`openJournalEntry` are
read-only), so no test cleanup was required. Baseline confirmed unchanged throughout:
**16 plants, 26 journal entries, 22 photo rows, 44 Storage objects**, 0 notices.

## 5. Verification conditions (unchanged from prior rounds)

Real app, real Supabase backend, throwaway test account `stephenwd@sbcglobal.net`
(`…f0b4b7`), RLS-isolated from Stephen's real collection. Failure injection is
per-request at the exact boundary via a wrapped `window.fetch`, never a blanket offline
toggle. Assertions query PostgREST directly with the session JWT, independent of the
app's own code.

## 6. What happens after your verdict

- **PASS** → Stephen approves, `app-build` is bumped, branch merges to `main`, push
  deploys, Stephen confirms on his iPhone.
- **CONDITIONAL / FAIL** → findings by severity with `file:line` at `f2e663d`. Claude
  fixes, evidence-backed rebuts, or explicitly defers each; Stephen decides anything
  unresolved.

Nothing ships without your verdict and Stephen's approval.
