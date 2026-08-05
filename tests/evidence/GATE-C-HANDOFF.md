# Gate C handoff — Phase C extraction, ready for review

**To:** Codex (independent reviewer) · **From:** Claude Code (implementer) · **Date:** 2026-08-03
**Decision requested:** PASS / CONDITIONAL / FAIL on Gate C, per `docs/stabilization-plan.md`
→ "Cross-model review gates" (Gate C is a **hard blocker**, Stephen's call 2026-08-02).

**Nothing is deployed.** This branch is pushed for review only; merging to `main` is what
deploys, and that needs your verdict plus Stephen's approval.

---

## 1. Where to look — READ THIS FIRST

```
Branch:            phase-c-pc-util-extraction
Commit under review: 753e0cf   (Phase C)
Also on this branch: d95fdd0   (Phase B tooling — prerequisite, see §6)
Diff base:         a48e6be = main
```

**Worktree warning (per CLAUDE.md's coordination rule).** This work was done in a hidden
worktree, but the branch is pushed, so **review it from the main checkout**:

```
cd "/Users/stephendavis/Documents/2- Plant Collector DB"
git fetch origin && git checkout phase-c-pc-util-extraction
```

Do **not** review `/Users/stephendavis/Documents/2- Plant Collector DB/.claude/worktrees/…`
— Claude may reuse those paths for later work and they are not what was pushed.

Read in this order:
1. `git diff main..HEAD -- app/index.html` (what left)
2. `app/lib/pc-util.js` (where it went)
3. `tests/unit/pc-util.test.js` (the contract)
4. `decisions.md` → the 2026-08-03 Phase C entry (the two gaps found — §4 below)

## 2. What changed

| | |
|---|---|
| `app/index.html` | 5,607 → **5,443 lines** (−164). 171 lines removed, 8 added. |
| `app/lib/pc-util.js` | new, 194 lines, **24 exported symbols** (22 functions + `IMPORT_MONTHS`, `LIFECYCLE_STATUSES`); `STOP` and `RANK` stay module-private |
| `tests/unit/pc-util.test.js` | new, 36 tests, all passing |

The 8 added lines in `index.html` are exactly: the `<script src="lib/pc-util.js?v=2026-08-03d">`
tag, a 2-line comment, a 4-line `const {…} = PCUtil;` alias destructure, and the `app-build`
bump. **Every call site below is textually unchanged** — that is the point of the alias
approach (the plan explicitly left this to Builder's choice; I chose aliases to keep the
diff minimal and reviewable).

**On the `app-build` bump.** Gate A's handoff deliberately left `app-build` *unbumped*;
this one bumps it (`2026-08-03c` → `2026-08-03d`) **on purpose**, because the plan's
cache-busting rule requires the `?v=` on an extracted lib script and `<meta app-build>` to
move in the same edit — a stale lib against a fresh page (or vice versa) must be impossible.
`main` remains at `...03c`; nothing ships until merge. Please confirm you agree this is the
right reading of the rule rather than a premature deploy signal.

## 3. Verbatim-move proof — reproducible, not my word for it

The gate's core question. I wrote a checker you can run yourself:

```
node tests/evidence/verify-phase-c-verbatim.js
```

It asserts (a) every line removed from `index.html` exists **byte-for-byte** in
`pc-util.js`, and (b) every added line is one of the sanctioned additions above. Current
result:

```
lines removed     : 171
lines added       : 8
removed-but-missing from pc-util.js : 0
added-but-unsanctioned              : 0
PASS
```

**Verified the verification** (playbook rule — a check that cannot fail proves nothing).
Mutating one character inside a moved body (`expandYear`'s `y>=100` → `y>=99`) makes it
fail and names the exact line. Two earlier self-checks of mine were *wrong* and I am
disclosing both rather than presenting only the clean run:

- A first bash-based check reported 10 false "MISSING" lines — shell backslash mangling,
  not real differences. Replaced with the Node script above (no shell quoting involved).
- The Node script's own first run reported 1 missing + 3 unsanctioned — **bugs in my
  checker**, not the extraction: it trimmed lines before matching patterns anchored on
  indentation, and it didn't account for the `app-build` line being a removed/added pair.
  Fixed and re-run. The intermediate failures are in the commit history.

## 4. Two pre-existing bugs surfaced — NOT fixed here, and I want your read

Writing tests for this code for the first time exposed two real defects. Both predate
this change and neither was introduced by the move. Per Condition 3 (slices move code
verbatim; fixes are separate later commits) I did **not** fix them:

1. **`parseImportDate('13/40/2020')`** — an invalid M/D/Y fails the range check and falls
   through to the bare `\b(19|20)\d{2}\b` year-only branch, which still finds "2020" →
   returns `{iso:'2020-01-01', precision:'year', warn:true}` instead of `null`. `warn`
   stays true so the import preview still flags it; the design intent was to give up.
2. **`matchGenusSpeciesFromString('Pinguicula x Tina', …)`** — the hybrid-boundary test
   runs on a space-padded copy (`" "+after`) but the `x`→`×` normalisation runs on the
   unpadded `after`, so a hybrid marker in first position is *detected* but never
   *normalised*: species survives as literal `"x Tina"`. **This is the exact leading-`x`
   shape the real Pinguicula sample sheet uses**, so real import data can hit it.

Both are pinned by tests that currently assert the **actual (buggy) behaviour**, with a
comment marking them as known gaps — so the tests are honest about what the code does
today and will fail loudly when someone fixes it. **Question for you:** is pinning
current behaviour the right call here, or would you rather see them as `todo`/skipped
tests so a green suite never implies the behaviour is correct? Your call changes what I
do in the follow-up commit.

## 5. Mutation spot-check (Condition 10 — 1–3 mutations for a low-risk pure extraction)

Three deliberate bugs, each applied then reverted; suite result shown:

| Mutation | Result |
|---|---|
| `expandYear` pivot `49` → `48` | **caught** (34 pass / 2 fail) |
| `thumbOf` suffix `_thumb` → `_thm` | **caught** (34 pass / 2 fail) |
| `guessStatus` drops the `sold` branch | **caught** (34 pass / 2 fail) |

Tree confirmed byte-identical to the commit afterwards. Propose your own mutations if
these are too gentle — that is exactly the check I cannot run honestly on myself.

## 6. Phase B is on this branch too (d95fdd0)

Phase C's tests cannot run without it, so the tooling bootstrap rides along: Node 26.6.0
via Homebrew, `package.json` (private, `npm test` = `node --test`, zero dependencies),
`tests/unit` + `tests/e2e`, `.gitignore` entries, and the worktree-coordination + dev-only
tooling rules in `CLAUDE.md`. Gate B evidence: `npm test` exited 0 with 0 tests, and
`git status` showed nothing in `app/` changed. Phase B has no cross-model gate of its own;
flag anything you dislike as a Gate C finding.

## 7. Live verification — and one honest gap

Real app, real Supabase backend, throwaway test account, Browser pane against **this
worktree over `file://`**. Zero console errors throughout. `PCUtil` loads in-browser with
all 24 exports matching Node exactly.

- **Add-plant flow:** added a real `Pinguicula esseriana` → acquisition date defaulted to
  `2026-08-03` (proves `todayLocal()` fires through the alias), duplicate-detection banner
  fired (`sameSet`), Acquired journal event written (proves `uid()` through a real
  PostgREST write). Deleted afterwards; genus count returned 14 → 15 → **14**, so no test
  residue.
- **Import parsing — SUBSTITUTE METHOD, please scrutinise.** I could not drive the native
  file-picker dialog from this tooling, so instead of skipping the check I read real rows
  out of a local private-spreadsheet fixture (via the vendored `xlsx.full.min.js` in Node)
  and called `PCUtil.guessImportMap` / `parseCombinedName` **in the live browser session**
  on that real messy data — the sheet's true 8-column header row plus real combined-name
  strings exercising the leading-hybrid, quoted-cultivar, and `var.`-rank shapes. All
  parsed correctly. Fixture content is intentionally not quoted here — AGENTS.md permits
  reading private spreadsheets as local test fixtures but not committing their contents,
  and this repo is public. **This is not the same as clicking through the import wizard**,
  and I am not claiming it is: the mapping-screen UI, preview rendering, and the
  commit-to-database step were not exercised. If you consider that insufficient for Gate C,
  say so and I will find another route (Stephen driving the picker, or a Phase D e2e test).

The plan also asks for the **sample Pinguicula sheet** specifically; it lives in Google
Drive, not the repo, so I used the local JF fixture instead. Note that the leading-`x`
bug in §4 is precisely what that sheet would have exercised.

## 8. Not yet done

- **Your review** (this document).
- **iPhone spot-check after deploy** — the plan flags script loading as the WebKit-sensitive
  part of this phase. Cannot be done before merge; Stephen's device is the final gate.

## 9. What happens after your verdict

- **PASS** → Stephen approves → merge to `main` → Pages deploys `2026-08-03d` → Stephen
  confirms on his iPhone → Phase C closes and D1 begins.
- **CONDITIONAL / FAIL** → findings by severity with `file:line` at `753e0cf`. I fix,
  rebut with evidence, or explicitly defer each; Stephen decides anything unresolved.

Nothing ships without your verdict and Stephen's approval.
