# Gate A handoff — Phase A ready for blocking review

**To:** Codex (independent reviewer) · **From:** Claude Code (implementer) · **Date:** 2026-08-02
**Decision requested:** PASS / CONDITIONAL / FAIL on Gate A, per `docs/stabilization-plan.md`
→ "Cross-model review gates". Nothing is deployed; `app-build` is deliberately unbumped.

---

## 1. What to review, and exactly where

**Review this path — NOT the main checkout.** Claude works in a hidden worktree; the main
checkout is on `main` and does not contain this work (`AGENTS.md` worktree rule).

```
/Users/stephendavis/Documents/2- Plant Collector DB/.claude/worktrees/busy-greider-dc4153
Branch: phase-a-safety-fixes
```

| Commit | Contents |
|---|---|
| `055af3e` | A3 — migration paper trail (docs/comments only; skip-tier, pre-approved) |
| `64a528e` | **Your specification, committed verbatim**, unedited by the implementer |
| `bdb8f44` | A1 / A2 / A4 implementation + first evidence pass |
| `e5de973` | Your Gate A rulings implemented + evidence addendum |

**Read in this order:** `tests/specs/phase-a.md` (your spec) →
`tests/evidence/phase-a-gate-a.md` (all boundaries + the rulings addendum) →
`app/index.html` (the diff: `git diff 64a528e..e5de973 -- app/index.html`).

Line-number citations should use `e5de973`, not the pre-implementation `main` you
specified against. A location table is in the evidence file's addendum.

---

## 2. Verification conditions (so you can judge whether the evidence is worth anything)

- **Real app, real backend.** `app/index.html` from this branch, served over HTTP to a real
  Chromium, against the **live Supabase project** as the throwaway test account
  `stephenwd@sbcglobal.net` (`…f0b4b7`). RLS isolates it from Stephen's real collection.
- **Failure injection is per-request at the exact boundary** — `window.fetch` wrapped to
  fail one specific call. Never a blanket offline toggle (your spec forbids that as
  insufficient). Everything else executed for real.
- **Assertions are independent of the app's own code**: a separate PostgREST client using
  the session JWT queried rows directly; the Storage list API enumerated objects; UI facts
  were read from the live DOM (`offsetParent`, `getComputedStyle`, `innerText`).
- **Baseline discipline.** Before: 16 plants / 26 journal entries. After all testing and
  cleanup: **16 plants / 26 journal entries**, 0 `GATE-*` rows, 0 `R3-*` rows, 0 test
  Storage objects.

---

## 3. Result: 10 of 10 boundaries PASS

| Boundary | Result | The load-bearing number |
|---|---|---|
| A.1 event fails after primary mutation (**all 4 matrix rows**) | PASS | retry made **0** plant writes; same event UUID reused; exactly 1 event |
| A.2 category attach fails | PASS | 0 links → retry → 2 links; still 1 plant, 1 event |
| A.3 thumbnail fails after full upload | PASS | orphaned full image **removed**; 0 photo rows |
| A.3 variant — cleanup itself fails | PASS | file **genuinely still present** (verified by listing Storage) and the banner says so |
| A.4 photo row fails after both uploads | PASS | **both** objects removed |
| A.5 cover update fails | PASS | photo + both objects intact; **0** Storage ops during retry |
| A.6 load fails (plant query *and* reference query) | PASS | `loaded=false`; empty-collection message suppressed; pre-existing reference list **preserved** |
| A.7 double startup | PASS | shared promise; **1** plant select, 5 reference selects |
| A.8 ambiguous response | PASS | all six of your required proofs — see §4 |
| Normal-path control (no injection) | PASS | everything saved; **no** notice shown |

---

## 4. Your rulings — disposition

**Ruling 1 (Storage: no mutation; reads permitted) — implemented, and re-measured.**
Evidence now separates Storage *mutations* from *reads*. Every non-GET request during a
startup load was logged and classified; the only one is
`POST /storage/v1/object/sign/photos` — signed-URL generation, a read. Event-only failures
and retries recorded **0** Storage mutations.

**Ruling 2 (resumable pipeline accepted) — evidence provided as required.** Retry never
reinserts the plant nor repeats completed work: `plantWritesDuringRetry: 0` (A.1),
`plantWriteRequestsDuringRetry: 0` (A.8), `plantPatches: 1` and `storageOpsDuringRetry: 0`
for a cover-only retry (A.5), and quantity unchanged by retry (add-to-existing row).

**Ruling 3 (three-way distinction) — this was NOT in the first pass; your ruling caught a
real defect.** The banner had flattened everything into "could not be saved", which is
wrong for a dropped connection where the work may already be saved. Now:

| Situation | Injection | Observed banner |
|---|---|---|
| Known failed | server 500 with `code:"XX000"` | *"…the history event could not be saved."* |
| Outcome unknown | real insert commits, then `TypeError('Failed to fetch')` | *"…could not be confirmed (it may or may not have been saved)."* |
| Not attempted | thumbnail 500 → cover depends on it | *"…a photo could not be saved; the cover photo was not attempted."* |

The classifier is derived from **measured** supabase-js error shapes, not assumption:
network drop returns `code:""` with the stack trace in `details`; a server rejection returns
a real `code`. An earlier version of the classifier also keyed on `details`/`hint` — which
are populated in **both** cases — and therefore mislabelled dropped connections as "failed".
Found by probing the actual error objects; fixed and re-verified.

**Ruling 4 (line shifts, product seeding) — done.** Location table added to the evidence
addendum. Single-flight re-run on the **established** account: `productWriteRequests: 0`,
so seeding does not obscure the counts.

**Ruling 5 (A.8 must be proven, not assumed) — all six proofs:**

| Required proof | Evidence |
|---|---|
| First request reached the server and committed | `eventCommittedOnServer: 1`, queried while the client still believed it failed |
| App received a simulated failure | banner: *"could not be confirmed…"* |
| Identical UUID in both requests | `["61750047-…6a77", "61750047-…6a77"]` |
| Retry does not replay the plant mutation | **`plantWriteRequestsDuringRetry: 0`** (request log, not outcome inference) |
| Final DB has exactly one event | `finalEventRows: 1` |
| Reloaded timeline shows exactly one | `uiTimelineItems: 1` |

---

## 5. Things you should push on

Listed because a reviewer should not have to find them.

1. **Disclosed wording difference.** For the *new-plant* A1 row the grouped sentence says
   *"could not be saved"* where your matrix example says *"could not be recorded"* (the
   other three rows, via `secondaryOrWarn`, do say "recorded"). Same intent; your call
   whether to require exact wording.
2. **A `plantRows: 2` reading was investigated, not accepted.** `created_at` showed two
   test runs 2.5 minutes apart — leftover pre-fix data, not a retry duplicating a plant.
   The request-log count of 0 plant writes is the actual proof. Rows since deleted.
3. **A bug in the first implementation, found during verification** (not by the spec):
   `x-transition` rewrites the `style` attribute and wiped an inline `display:none`,
   leaving an empty amber bar on screen. Same trap as `decisions.md` 2026-07-21. Fixed via
   the project's existing `x-cloak` convention. Worth confirming the fix is the right one.
4. **Two extra fixes outside your spec**, same bug class (post-boundary misreport):
   deleting a plant then failing to refresh reported *"Could not delete this plant"* for a
   plant already gone; and `refreshDetail()` surfaced a refresh failure as the caller's
   write failing. Both now report the truth. Please confirm these are in scope rather than
   unreviewed drive-by changes.
5. **`schema.sql` citations shift +3 lines** vs the `main` you reviewed (A3's header
   correction). Content unchanged.

---

## 6. Explicitly NOT covered by this evidence

- **iPhone / WebKit rendering** of the new notice — Chromium only. Stephen's device check
  remains the final gate before deploy.
- **Automated regression tests.** All of the above is manual, reproducible-by-script
  evidence. Per the plan, Phase D converts these boundaries into Playwright specs, and
  Phase F may not begin until that conversion exists.
- **Server-side atomicity.** Phase A delivers visible partial-success handling and
  compensation, *not* transactions. Recorded in the plan's "Deferred stabilization work"
  table so banners are never mistaken for integrity fixes.

---

## 7. What happens after your verdict

- **PASS** → Stephen approves, `app-build` is bumped, branch merges to `main`, push
  deploys, and he confirms on his iPhone.
- **CONDITIONAL / FAIL** → findings by severity with `file:line` at `e5de973`. Claude
  responds to each with a fix, an evidence-backed rebuttal, or an explicit deferral;
  Stephen decides anything unresolved.

Nothing ships without your verdict and Stephen's approval.
