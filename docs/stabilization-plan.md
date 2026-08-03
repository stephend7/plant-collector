# Stabilization Plan — safety fixes, tests, and gradual extraction

> **Status: v4 — Gate 0 confirmation-pass blockers cleared 2026-08-02. Nothing built yet.**
> Round 1: ChatGPT's Gate 0 review found 6 High + 9 Medium + 4 Low; all six High fixed
> (clean-export Gate D, D1/D2 split, fail-closed network rules, named Phase T,
> runner-local CI, idempotent retry). Round 2 (confirmation pass) confirmed 5 of 6
> resolved and raised 2 blockers + 3 mediums — all now fixed in this revision:
> **B1** signup shutdown promoted to immediate **A0**; **B2** header + forbidden-files
> rules reconciled with Phase T; **M1** the circular schema-manifest split into
> expected-vs-actual; **M2** D2's temporary-account exception stated; **M3** CI
> "write context" wording corrected. No finding across either round was rebutted.
> Approved by Stephen 2026-08-02: the two playbook skips (tier-map table), the
> pre-tester scanner rate limit (Phase T), and the blocking two-user RLS check.
> **Per ChatGPT's stated condition, Gate 0 passes once these edits land — this is that
> revision. Awaiting Stephen's final approval to begin Phase A.**
> **A0 update:** disable-public-signup is now DONE and independently verified (Claude
> queried the project's live auth-settings endpoint: `disable_signup: true`,
> `anonymous_users: false`) — no longer a caveat for the reviewer. See A0 below.
>
> **Not yet committed to the repo.** This plan, `docs/codex-access-map.md`, and the
> replacement `AGENTS.md` should land together so Codex reads them from committed
> history rather than from hand-passed files.
> Architect: Fable 5, 2026-08-01 (Stephen chose to stay on Fable 5 for this effort).
> Origin: ChatGPT's independent audit (2026-07-24) + our line-by-line verification of it
> (`~/Downloads/Plant_Collector_Second_Opinion_by_Claude.docx`). 8 of its 9 core claims
> confirmed against code; 2 additional bugs found while verifying.
> Goal (Stephen, 2026-07-29): **stability and long-run manageability.** Explicitly NOT
> in scope: sale-readiness items such as billing, broad metering, self-service account
> deletion/export, and public registration hardening. **The limited scanner protections
> required for invited testers ARE in scope, under Phase T** (reconciled per Gate 0
> confirmation pass, B2).
> Cross-model review gates folded in from ChatGPT's `Cross_Model_Review_Plan` (2026-08-02),
> with the amendments recorded in "Cross-model review gates" below.

**Agent capabilities — verified 2026-08-02, not assumed.** Codex is the ChatGPT desktop
app (CLI bundled at `/Applications/ChatGPT.app`); config at `~/.codex/config.toml`.
Empirically confirmed by running probes, not by reading its self-report:

| Capability | State | Consequence for this plan |
|---|---|---|
| Project trust | `trusted` for the repo root | Codex reads every project file, incl. the private spreadsheets + photo fixtures |
| Shell commands | Yes | Codex can run tests and perform Gate D itself |
| Network | **Yes** (`HTTP:200` to npm registry) | Codex can install tooling and pull images unaided |
| Repo `.git` writes | **No — READ-ONLY** | Codex cannot commit/branch/push: reviewer ≠ author is sandbox-enforced, not policy-enforced |
| Browser automation | Enabled (Chrome + in-app) | Live browser verification is available to Codex if a gate needs it |
| Cloud credentials | None (no Supabase/Anthropic/Google keys) | Gate D must be **local**; no secret ever has to be handed to Codex |
| Installed tooling | Homebrew only — **no Node, npm, Docker, or Supabase CLI** | Phase B/D installs are real work, confirmed from both agents' side |

---

## What this effort is

One full-tier stabilization effort with two interleaved strands:

- **Testing:** move the primary quality gate from "Stephen clicks around in his browser"
  to "an automated suite is green," with Stephen's iPhone kept as the final device gate.
- **Extraction:** gradually move logic out of the 5,210-line `app/index.html` into small
  `app/lib/` files, so the code can be tested in pieces and edited safely as it grows.

They are one effort because each extraction is only safe if tests prove behavior didn't
change, and most tests are only possible once the logic is extracted. Rhythm:
**extract a little → test it → extract more.**

**Standing rule while this effort runs:** no brand-new features into `index.html`.
The file stops growing while we shrink it. (Bug fixes fine.)

## Non-goals

- No framework rewrite. Alpine stays. The audit and we agree on this.
- **No build step for the app.** `index.html` + plain script files, served as-is from
  GitHub Pages, deploy = `git push`. Node/Playwright live on the *developer* side only
  (a `tests/` folder and a `package.json` that the deployed app never touches).
- No schema or RLS changes. `schema.sql`, `app/migrations/*.sql`, and
  `supabase/functions/` are untouched by every phase below, with **two named
  exceptions**: Phase A3 (README status table + two header comments, docs-only) and
  **Phase T** (the tester-safeguards phase, which explicitly overrides this rule for
  the scan-tag Edge Function and any new rate-limit table/migration — for that phase
  only, full tier, per Gate 0 finding H4). Historical applied migrations are never
  rewritten; corrections ship as NEW migrations.
- No sale-readiness work (see header). Phase T covers *friendly-tester* safety only.

---

## A0 — Disable public signup ✅ DONE + VERIFIED 2026-08-02

> **Status: COMPLETE.** Stephen disabled public signup in the Supabase dashboard
> (found at `…/auth/providers` → Email provider). **Independently verified by Claude,
> not self-reported** — the project's public read-only auth-settings endpoint
> (`GET /auth/v1/settings`, publishable key, no side effects) returns:
>
> ```
> disable_signup           : True
> external.anonymous_users : False
> ```
>
> Both doors are shut: no self-registration, and no anonymous-session side entrance.
> Accounts can now only be created administratively from the dashboard.
>
> Phase T re-verifies this same flag before any tester is invited — a dashboard setting
> can be flipped back by accident, so it is re-checked, not assumed.

Per Gate 0 confirmation pass, B1. Not a code change: a Supabase Auth setting, and the
single highest-value security action that was available.

**Why it can't wait for Phase T.** The app is publicly reachable, the signup UI is live
(`app/index.html:415` → `sb.auth.signUp`, verified), and the scanner has no per-user
limit — so any stranger who finds the URL can create an account and generate real
Anthropic charges. Phase T is several phases away; that exposure window is unnecessary.

**Steps (completed 2026-08-02):**
1. ✅ Supabase dashboard → Authentication → Providers → Email → sign-ups OFF.
2. ✅ Verified via `GET /auth/v1/settings` → `disable_signup: true`.
3. ⬜ Confirm existing accounts (Stephen's + the throwaway test account) still sign in —
   do at the next natural sign-in; disabling *signup* does not affect existing users,
   and Stephen's own session already works.
4. ✅ Evidence recorded here; carries into decisions.md with the Phase A commit.
5. ⬜ Phase T re-verifies the flag before any tester is invited.

**Account rule (per confirmation pass, M2):** *No human tester account is created before
Phase T.* Gate **D2 may create one temporary, administrator-controlled account solely for
the production isolation test, deleted immediately after.*

**Related, already done 2026-08-02:** the repo was briefly flipped private, which
unpublished GitHub Pages and took the live app offline (Pages won't serve a private repo
on the Free plan). Restored: repo public, Pages site recreated, app verified serving
build `2026-07-21a`. **Repository privacy is a separate hardening decision — it is not a
substitute for A0, rate limits, or RLS verification** (confirmation pass). If pursued
later: buy GitHub Pro *first*, verify Pages still serves, *then* flip — no downtime.

---

## Phase A — Four safety fixes (Lite tier, ship first)

> **SUPERSEDED 2026-08-02 — write-Retry removed from scope.** Every mention of "Retry"
> below (A1's banner text, the A1 matrix, Gate A's boundary list, the idempotent-event
> language) describes the **original design**, built and then removed after Codex Gate A
> rounds 3 and 4 found 8 findings — every one inside the retry/notice machinery, none in
> the safety fixes themselves. Stephen's call (recorded in `decisions.md`, 2026-08-02):
> keep the truthful-notice guarantee, drop Retry as a feature until Phase D can hold it
> under automated tests. **This text is preserved as the historical record of what was
> built and why it changed — it does not describe current behavior.** Current contract:
> partial-success notices are **append-only, Dismiss-only**, and never disappear except
> by the user's own Dismiss. Load-error notices are the one exception and **keep Retry**
> (a read-only re-fetch carries none of the risk that made write-retries fragile). See
> "Deferred stabilization work" below for when write-Retry returns.

Small, independent, high-value. Each one is a separate commit; together they can be one
deploy. These go first because they protect data *today* and don't depend on tooling.

**A1 — Stop swallowing event errors.** `savePlant` (line ~3335, ~3360), `addToExisting`
(~3427), `saveTileStatus` (~3559) wrap history-event writes in `.catch(()=>{})`. Replace
with: the main change still succeeds, but the user sees an **amber** banner (house rule:
never green, dismiss link, no short auto-hide): "Saved, but the history event could not
be recorded — Retry / Dismiss." Retry re-attempts just the event.
**Retry must be idempotent (Gate 0, H6):** the event's UUID is generated client-side
*before* the first attempt and reused on every retry, so an "insert succeeded but the
response was lost" ambiguity cannot create duplicates — a primary-key conflict on retry
is treated as success. (Photos already use client-generated IDs; events adopt the same
pattern.) Acceptance: under an ambiguous-response simulation, exactly one event exists.

**A2 — Fix the misleading-failure paths in `savePlant` (tightened per Gate 0, H6).**
- `syncCategories` (~3361) is *outside* any catch: if it fails after the plant + photos
  committed, the user sees "Could not save the plant" for a plant that saved → they
  re-save → duplicate. Give it the same amber partial-success treatment as A1.
- **Hard rule: once the plant row exists, NO later failure (photo, thumbnail, cover,
  category, event) may display "the plant failed to save."** Later failures are partial
  success, reported as such.
- Photo compensation, all three failure points: (1) thumbnail upload fails after full
  image uploaded → remove the full image; (2) photo-row insert fails after both files
  uploaded → remove both files; (3) any cleanup itself fails → that is *visible* partial
  success in the banner ("a stray file may remain"), not a silent console line.

**A3 — Fix the migration paper trail (docs-only).**
- `app/migrations/README.md`: extend the status table through 011 (all applied — the
  features shipped and run live against them; note the applied dates as "on or before"
  the shipping build where the exact day isn't recorded in decisions.md).
- `app/schema.sql` header: delete "DRAFT … NOT yet run" (line ~4); replace with
  "APPLIED 2026-06-17 — baseline of the live database."
- `003_event_log_and_care_fields.sql` header: delete "PENDING SIGN-OFF. Do NOT run"
  (line ~2); replace with "APPLIED 2026-06-18."

**A4 — Loading failures must not look like an empty collection.**
- `loadPlants` (~2964): on error, set a visible load-error state with a Retry button
  (amber), instead of `console.error` + empty screen. Same for the reference-list loads
  in `loadData` (~2924) — one shared "couldn't load your collection" state is fine.
- Single-flight `loadData`: `init()` triggers it from both `onAuthStateChange` (~2876)
  and `getSession` (~2880), so every cold start loads the collection twice. Guard it the
  same way `loadProducts` already guards itself (~2940).
- Scope note (Gate 0, M8): one shared load-error state is deliberate for Phase A. The
  audit's richer taxonomy (offline vs auth-expired vs DB failure vs schema mismatch vs
  photo-signing) is recorded in **Deferred stabilization work**, not silently dropped.

**Assertions first (cross-model, per Gate 0 M1):** before A1/A2 are built, Codex writes a
**committed written acceptance specification** (`tests/specs/phase-a.md`) — executable
tests come later in Phase D, since the tooling doesn't exist yet. The spec defines the
expected outcome at each *exact* failure boundary, and those cases become automated
Playwright tests in Phase D (see M3 precondition in Phase F).

**Gate A (failure injection at exact boundaries — Gate 0, M1):** generic "DevTools
offline" is insufficient (it fails the *plant* write, not the secondary write). Each
failure is forced at its precise boundary — via DevTools request-blocking on the specific
endpoint call, ordered so the plant save has already succeeded:
1. event insert fails after plant save; 2. category attach fails after plant save;
3. thumbnail upload fails after full upload; 4. photo-row insert fails after both files
uploaded; 5. cover update fails after photo-row insert; 6. collection load fails;
7. double-startup attempted (single-flight holds); 8. ambiguous event response → retry
creates exactly one event. Normal saves still work. **Then Codex's blocking failure-path
review** (see Cross-model review gates), all material findings resolved or explicitly
accepted by Stephen — then deploy + Stephen's iPhone spot-check.

---

## Phase B — Developer tooling bootstrap (no app changes)

- Install Node LTS on this Mac via Homebrew (`brew install node`) — one-time; the
  machine currently has none.
- Repo root gets: `package.json` (private, scripts only), `tests/unit/`,
  `tests/e2e/`, `.gitignore` additions (`node_modules/`, `.env`, `test-results/`,
  `playwright-report/`).
- **Replace the stale `AGENTS.md`.** One already exists (untracked, 2026-07-14) and is a
  near-verbatim *fork* of CLAUDE.md that has since diverged — it names the dead
  `test@test.com` throwaway account (replaced 2026-07-18), invents "Codex-in-Chrome",
  and carries a stale model-rotation section. That is exactly the "two long, divergent
  instruction sets" failure ChatGPT's own audit warns about. Replace it with a short
  **pointer** file: CLAUDE.md is canonical; AGENTS.md adds only the Codex-specific rules
  (start read-only, cite `file:line`, never edit production config, never edit a branch
  concurrently with Claude, **always confirm which working tree** — see below). Both
  files point at one canonical source; neither duplicates it. Commit it (currently
  untracked, so Codex reads rules that aren't in the repo's history).
- **Worktree coordination rule (new, and load-bearing).** Claude works in hidden
  worktrees under `.claude/worktrees/`; Codex reads the **main checkout** by default.
  Every handoff must name the exact path being reviewed, or Codex reviews stale code.
- Unit tests use Node's built-in `node:test` + `node:assert` — **zero dependencies**.
  Playwright is added in Phase D, not here.
- Documented single command: `npm test` runs unit tests; `npm run e2e` runs browser tests.

**Gate B:** `npm test` runs (0 tests, exits clean). Nothing in `app/` changed —
`git status` proves it.

---

## Phase C — First extraction + first real tests

**What moves:** the band of already-pure, top-level helper functions at
`index.html:2397–2587` — they live *outside* the Alpine component, reference no `this`,
no DOM, no Supabase, so this is the lowest-risk slice in the file:

- Utilities: `todayLocal`, `sameSet`, `thumbOf`, `uid`, `isHeic`, `escapeRe`
- Text normalizers: `normWS`, `normQuotes`, `normKey`, `pad2`, `expandYear`
- Import parsing (untrusted-input handling): `parseImportDate`, `parseCombinedName`,
  `scrapePrice`, `cleanPrice`, `guessImportMap`, `guessStatus`, plus the
  `IMPORT_MONTHS` / `LIFECYCLE_STATUSES` constants
- Name matching: `extractEpithet`, `matchGenusSpeciesFromString`, `matchGenusSpecies`
  (pure — genus list passed as an argument), `collectStrings`, `exifDateOf`

**Destination:** `app/lib/pc-util.js`, dual-environment pattern so the same file works
in the page and in Node tests with no build step and no timing risk:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node tests
  else root.PCUtil = api;                                                    // browser
})(this, function () { /* the functions, verbatim */ return { ... }; });
```

Loaded as a classic script before the main inline script:
`<script src="lib/pc-util.js?v=BUILD"></script>` — CSP already allows `'self'` scripts;
call sites inside `index.html` change from `parseCombinedName(...)` to
`PCUtil.parseCombinedName(...)` (or a one-line local alias per function at the top of
the inline script, keeping the diff small — Builder's choice, stated in the commit).

**Cache-busting rule (learned the hard way on iPhone):** the `?v=` value on every
extracted-file script tag **is the app-build marker** and is bumped in the same edit as
`<meta name="app-build">` on every deploy. A stale lib + fresh page (or vice versa) must
be impossible. This rule goes into CLAUDE.md's deploy note in the same commit.

**Not in this slice (deliberately):** `displayName` and other component methods (Alpine-
scoped; they move later with a delegation pattern), the photo pipeline, crop code, GSheet.

**Exact starter unit tests** (`tests/unit/pc-util.test.js`), the contract the extraction
must preserve — written *before* the move, run against the extracted file:

| Function | Cases |
|---|---|
| `parseCombinedName` | `"Nepenthes veitchii 'Candy', BE-3390"` → genus `Nepenthes`, species `veitchii 'Candy'`, accession `BE-3390`, no warn · `"N. veitchii"` → warn (abbreviated genus, left for user) · `"pinguicula moranensis"` → genus capitalized `Pinguicula` · single token `"Drosera"` → species-only + warn · smart quotes `’` normalized to `'` |
| `parseImportDate` | `"2024-05-17"` → day precision · `"8/9/21"` → `2021-08-09`, warn (M/D ambiguity) · `"August 2020"` → `2020-08-01`, month precision, warn · `"Aug. 2020"` same · `"2019"` → `2019-01-01`, year precision, warn · `"13/40/2020"` → null + warn · empty → null, no warn |
| `guessStatus` | `"Died winter 2023"`→`dead` · `"SOLD"`→`sold` · `"traded to Dave"`→`traded` · `"gift"`→`given_away` · `"still have it"`→`in_collection` · `""`→`in_collection` · `"???"`→`null` |
| `guessImportMap` | JF-sheet-style headers `["Plant Name","Source","Date Obtained","Notes","Description"]` → combinedName/vendor/acquisitionDate/notes/**notes2** (second notes-shaped column not dropped) · `"Descriptor"` → formDescriptor, NOT notes |
| `matchGenusSpeciesFromString` | `"Pinguicula moranensis"` with genus list → match · leading-`x` hybrid form from the Ping sheet · genus-only string → genus hit, empty species |
| small utils | `sameSet` (order-insensitive, string/number mix) · `thumbOf` (`a/b.jpg`→`a/b_thumb.jpg`) · `cleanPrice("$14.50")`→14.5 · `scrapePrice("Heli ionasi $85")`→85 · `expandYear(49)`→2049, `expandYear(50)`→1950 |

**Gate C (behavior-preserving proof):**
1. `npm test` green.
2. Function bodies moved **verbatim** — reviewer diffs old vs new text.
3. Live browser check: run one real spreadsheet import preview (the sample Ping sheet)
   and one add-plant flow; results identical to pre-change.
4. **Codex's blocking verbatim-move + test-gap review** (see Cross-model review gates),
   material findings resolved.
5. Deploy + iPhone spot-check (script loading is the WebKit-sensitive part).

---

## Phase D — First end-to-end browser test (Playwright)

**Test database: LOCAL Supabase, not a cloud project** (corrected 2026-08-02 once Codex's
real capabilities were verified). `supabase start` runs Postgres + Auth + Storage in
containers on the Mac, seeded by running the committed `schema.sql` + migrations 001–011
in order. Chosen because it is the only option that makes the clean-room test *honest*:

- **No secret ever changes hands.** Local Supabase's dev keys are fixed and public by
  design, so Codex needs nothing from Stephen or from Claude — and there is no test
  credential to leak, rotate, or accidentally commit.
- **Codex can perform it unaided** — verified network access + shell + file writes.
- Resets with one command, works offline afterwards, costs nothing, and seeding a
  second user for the required isolation check is trivial.
- Production exposure is minimized — but NOT "structurally unreachable" (corrected per
  Gate 0, H3: the machine has network and the repo contains the production URL, so
  reachability is prevented by *enforced rules*, below, not by architecture).

**Fail-closed production blocking (Gate 0, H3 — blocking requirement):** before any
authentication or write, the Playwright suite asserts the resolved Supabase origin is on
an explicit local allowlist; any request to the production Supabase hostname (or any
non-allowlisted Supabase host) aborts the suite immediately; if the `config.js`
interception did not occur, the suite fails before login; the run records that zero
requests touched the production hostname. Unique test records + cleanup even locally.

Prerequisite: a container runtime (none installed). **Prefer `brew install colima docker`
over Docker Desktop** — Colima installs into Homebrew's prefix without an admin password,
while the Docker Desktop cask normally prompts for one. Stephen shouldn't need to hand
over his password for a test harness. Fallback: a disposable free-tier cloud project
**only** if some behavior genuinely cannot be proven locally (per the access map's own
recommendation #5); if that happens, it is documented as a finding, not a silent step.

**This is simultaneously the audit's "prove the database is reproducible" drill.** If the
committed files cannot produce a working database, we learn it here, in a disposable
environment, and fix the files. Every gap found is logged in decisions.md as a
reproducibility failure — not quietly patched. Fixes to migration problems ship as NEW
migrations; applied historical migrations are never rewritten (Gate 0, M4).

**Clean-export rule (Gate 0, H1 — blocking requirement):** Codex performs the rebuild
from a directory containing ONLY the committed tree at one named commit —
`git archive <SHA> | tar -x -C <temp-dir>` — never from the normal checkout, which
physically contains untracked files, ignored private spreadsheets, photos, and Claude's
worktrees. The commit SHA is recorded with the evidence. (The private spreadsheets stay
available for Gate C's test-gap review; they are *absent* during Gate D.)

**Gate D is split (Gate 0, H2):**

- **D1 — Repository reproducibility (local).** Everything in this phase: clean-export
  rebuild, schema manifest, smoke test, local two-user isolation.
- **D2 — Production parity (before any tester account).** Local proof says the committed
  SQL is correct; it says nothing about whether the LIVE database drifted (a manually
  edited policy, a missing migration, a storage-policy difference — the audit's original
  unresolved risk). D2: export the live schema/policies (Stephen or Claude runs the
  read-only dump — Codex needs no production credentials), diff against the D1 clean-room
  result, explain every difference; then one narrowly-scoped two-account isolation test
  against production using ordinary user sessions (never the service-role key), with the
  temporary second account's records and files deleted afterwards. Codex reviews the
  sanitized diff + evidence.

**Schema manifest — TWO artifacts, never one** (Gate 0 M4, corrected by the confirmation
pass M1: deriving the manifest *from* the rebuilt database and then checking that
database *against* it proves nothing — it's circular). One smoke test can't prove eleven
migrations, so D1 produces:

1. **Expected manifest** (`tests/schema-expected.md`) — derived independently by reading
   `schema.sql`, migrations 001–011, and their documented intent. **Codex derives or
   reviews this BEFORE seeing the rebuilt database**, so the expectation isn't
   contaminated by the result.
2. **Actual manifest** (`tests/schema-actual.md`) — exported from the rebuilt database.

The gate compares **expected vs actual**, and every difference is explained. Contents of
both: tables, columns, constraints, FKs, functions, RLS-enabled tables, policies, storage
bucket + policies. D2 compares **production vs expected** using the same artifact.

**Version pinning (Gate 0, L4):** the Supabase CLI, Playwright, and Node versions used
for the clean-room proof are recorded in the evidence and pinned in `package.json` /
config so the rebuild is repeatable later.

**Pointing the app at it without touching the app:** Playwright intercepts the
`config.js` request (`page.route`) and serves the local stack's credentials. Zero app
changes, grep-provably no test hooks in production code.

**The one starter test** (`tests/e2e/smoke.spec.js`):
sign in as the seeded test user → add a plant (inline-add a new genus + species, set
today's acquisition date) → assert it appears in the list with the right display name →
open detail → assert the acquired event exists (this also pins Phase A1's behavior) →
sign out. Run on Chromium **and WebKit** (closes part of the Safari gap Chrome testing
can't reach; the iPhone remains the final word).

**Secrets:** with a local stack there are effectively none — its keys are fixed dev
values, safe to commit in the test config. The only real secret is the throwaway
account's password used for *live* browser checks against production; it stays in a
gitignored `.env` on this Mac only. **It is never placed in CI** (Gate 0, H5): the
GitHub workflow runs entirely against its own runner-local stack and holds no
production credential of any kind.

**Serving the app:** Playwright's `webServer` runs `python3 -m http.server` in `app/`.

**Gate D1:** the clean-export rebuild succeeds; actual schema matches the committed
manifest; the suite passes locally on both engines; deliberately breaking the app
(e.g., renaming a function) makes it fail — a test that can't fail proves nothing;
the fail-closed production-blocking assertions demonstrably fire when pointed at a
non-allowlisted host. **AND the two-user isolation check passes** (blocking — Stephen,
2026-08-02), scoped per Gate 0 M2: the test list is **derived from every user-owned
table and storage policy in the rebuilt schema** (plants, events, photos, vendors,
growing locations, categories + junctions, import batches, pests, sheet links — whatever
the manifest lists), not hardcoded. For each: SELECT, INSERT-with-other-user's-parent,
UPDATE, DELETE as the other user must all fail. For Storage: list, download/sign,
upload-into-other's-path, update, delete must all fail. All assertions run as anon-key +
each user's JWT; the service-role key may seed and clean up, never assert.

**Gate D2 (before any tester account):** live schema/policy diff against the manifest is
clean or every difference is explained and dispositioned; the production two-account
isolation spot-check passes; temporary records cleaned up; Codex has reviewed the
evidence.

---

## Phase E — GitHub Actions wiring

Rewritten per Gate 0, H5 — the CI runner cannot reach a Supabase stack on Stephen's Mac,
and production credentials do not belong in a test workflow at all:

- `.github/workflows/tests.yml`: on every push — job 1 unit tests (seconds); job 2
  installs the **pinned** Supabase CLI, starts **its own local Supabase inside the
  runner's Docker**, seeds it with the committed clean-room setup (schema + migrations +
  two test users), and runs Playwright against that runner-local stack. Green check /
  red X on every commit on GitHub.
- **No production secret of any kind in this workflow** — no production URL override, no
  test-account password, nothing. The live-browser check against production remains a
  separate, manual gate performed from this Mac. The runner is discarded after each run.
- **Full-tier security review required for this phase** — new capability, no shipped
  analog: CI executes repository-controlled code in an external runner and receives
  repository metadata, but its GitHub token is restricted to `contents: read`
  (wording corrected per confirmation pass, M3 — it is not "write context").
  Review focuses on: workflow permissions
  (`permissions: contents: read`), nothing secret in logs/artifacts/failure screenshots,
  third-party actions pinned by SHA, untrusted-PR runs cannot access anything protected,
  and — explicitly — **verifying the workflow has no path to production configuration**.
- **Stage 2 (separate later decision for Stephen):** switching Pages deployment to
  Actions so a red suite *blocks* deploy instead of reporting after the fact. Not in
  this effort's scope; noted so it isn't forgotten.

**Gate E:** a push with a deliberately broken test shows a red X on GitHub; fixing it
shows green. Stephen can see the check from his phone.

---

## Phase F — Continued extraction (each slice = its own change, same rhythm)

**Precondition (Gate 0, M3): Phase F does not begin until the Phase A failure behaviors
are AUTOMATED** — the written spec from `tests/specs/phase-a.md` becomes Playwright
tests (partial-success banners, idempotent retry, photo cleanup, load-error + retry,
single-flight startup). Otherwise F would reorganize exactly the code whose most
important safety fixes were still protected only by manual checks.

**Per-slice mini-plans (Gate 0, M6):** before each slice begins, Claude writes a short
mini-plan — allowed files, baseline behavior, tests, rollback, security boundary,
objective gate — and **Stephen approves it before implementation**. (This matches the
playbook's Lite-tier "plan first" rule; recorded here so no slice skips it. It matters
most for F6, the largest and the one that touches error handling.)

Order, chosen so risk rises only after the harness is proven:

1. ~~pc-util~~ (Phase C).
2. **Photo pipeline** (`resizeImage`, `processImage`, HEIC handling, `uploadPhoto`,
   crop geometry `cropInitBox`/`cropSetBox`/math) → `app/lib/pc-photo.js`. Crop
   *geometry* gets unit tests; pipeline gets an e2e (add plant with photo → thumbnail
   appears). WebKit run + iPhone check mandatory (HEIC/canvas are Safari-sensitive).
3. **Name auto-detect** (`detectFromFile` band) → joins pc-util's matchers; e2e covers
   the filename-detection path.
4. **GSheet closure** → `app/lib/pc-gsheet.js`. **Full tier** (OAuth token surface —
   separate Security agent per playbook). Verification is grep **plus runtime** (Gate 0,
   M9): after the move, live checks confirm no token in Alpine state, the DOM,
   local/session storage, or logs; popup + refresh flows still work; and failure paths
   don't print token-bearing objects. Details in this slice's mini-plan.
5. **Import orchestration** (mapping/preview/batch logic inside the component). Full
   tier (untrusted-file import path per playbook).
6. **Repositories** (Supabase read/write call sites) — biggest touch, only after the
   e2e suite covers save/edit/event/import flows. This is also where Phase A's
   compensation logic gets consolidated instead of scattered.

End state: `index.html` is markup + Alpine component wiring; logic lives in tested
`app/lib/` files; still zero build step.

---

## Conditions for Builder

1. Branch per phase off `main`; one logical change per commit; stage specific files
   (never `git add -A`); co-author tag; **no commit or push until Stephen says.**
   Precise vocabulary (Gate 0, M7): **commit** = local history only; **push a phase
   branch** = makes it visible for CI/review, does NOT deploy; **merge/push to `main`**
   = deploys via GitHub Pages. "Deploy = git push" in older docs means push *to main*.
2. **Forbidden files — except where a named phase explicitly authorizes them** (per Gate 0
   confirmation pass, B2): `app/schema.sql`, applied migration bodies,
   `supabase/functions/**`, and production configuration values (`app/config.js`).
   Current named exceptions, and the only ones: **A3** (migrations `README.md` + two
   header comments, docs-only) and **Phase T** (the scanner Edge Function plus its
   approved new migration/database objects). No new third-party runtime dependencies in
   the app; dev-side deps limited to Playwright.
3. Extraction slices move code **verbatim** — refactors/renames/cleanups are separate,
   later commits, never mixed into a move.
4. Every phase ends at its Gate with **empirical evidence** (command output, test runs,
   screenshots) recorded in decisions.md — never self-reported "works." Verify the
   verification: a new test must be shown to fail before it's trusted to pass.
5. New user-facing error states follow the house UI rules: amber banners, dismiss
   links, no short auto-hide, standard icons, confirm before destructive actions.
6. Every deploy during this effort bumps `<meta name="app-build">` AND the `?v=` on all
   extracted lib script tags, in the same edit.
7. Security reviews: reviewer is not the author. Full-tier (real separate agent) where
   marked: Phase E (CI secrets), F4 (OAuth), F5 (import). Others: Lite inline pass.
8. If a Gate fails, stop and report — don't improvise forward.
9. **No weakening tests to get green.** Any commit that modifies an *existing* test gets
   its test-diff reviewed by Codex, answering one question: did any assertion get weaker
   or get skipped? This is a check Claude structurally cannot perform on itself.
10. **Mutation spot-checks, risk-scaled** (Gate 0, L1): Codex proposes deliberate bugs,
    Claude applies each on a throwaway branch and runs the suite; every mutation the
    suite misses is a proven coverage hole, logged in decisions.md. Scale: full ~5-bug
    baseline at the end of Phase D; 1–3 targeted mutations after low-risk pure
    extractions; ~5+ after security/data-integrity slices (F4/F5/F6); if a slice didn't
    materially change tests, the reviewer may waive it with a written reason.

---

## Cross-model review gates

Adopted from ChatGPT's `Cross_Model_Review_Plan` (2026-08-02), with amendments noted.
**Claude Code** is the primary architect/builder (deepest project context). **Codex** is
the independent repository reviewer. **ChatGPT** is plan-level oversight and milestone
auditor. **Stephen decides.** Claude and Codex never edit the same branch concurrently —
and per the verified capability table, Codex *cannot* commit here anyway.

**Cycle for every gate:** Claude implements on a branch → records evidence → Stephen
approves pushing for review → Codex reviews **read-only** first → findings by severity
with exact `file:line` → Claude responds to each with a fix, an evidence-backed rebuttal,
or an explicit deferral → ChatGPT helps interpret genuine disagreement → Stephen decides.

| Gate | Reviewer | Blocking? | Focus |
|---|---|---|---|
| 0 — plan review | ChatGPT | Yes, before approval | Omissions, weakened recommendations, disproportionate ceremony |
| A — safety fixes | Codex | **Yes** (Stephen, 2026-08-02) | Every changed failure/cleanup/startup path: what saved, what didn't, what the user sees — write-Retry was reviewed through round 4, then removed from scope; see the superseding note at the top of Phase A |
| C — extraction | Codex | **Yes** (Stephen, 2026-08-02) | Verbatim-move proof, export completeness, script order, CSP, cache markers, Node-vs-browser, parser test gaps |
| D1 — clean room | Codex | Yes | Performs the rebuild from a clean export of one named commit; schema manifest; local isolation |
| D2 — prod parity | Codex reviews evidence | Yes, before testers | Live schema/policy diff vs manifest; production two-account spot-check (Stephen/Claude execute; Codex needs no credentials) |
| T — tester safeguards | Codex | Yes (full tier) | Rate-limit atomicity, burst+daily+kill-switch, 429-before-paid-call, signup lockdown |
| E — CI | Codex | Yes (full tier) | Workflow permissions, nothing secret in logs, pinned actions, no path to production |
| F4 — OAuth | Codex | Yes (full tier) | Token-stays-in-closure contract re-proven after the move |
| F5 — import | Codex | Yes (full tier) | Untrusted input isolation, caps, inert formulas, undo safety |
| Post-E, post-F | ChatGPT | Advisory | Fresh repository audit at milestones |

**Amendments to ChatGPT's version, for the record:**

1. **Gates A and C are hard blockers** — Stephen's explicit call (2026-08-02), overriding
   Claude's proposal to keep them advisory as Lite-tier items. Recorded because it is a
   deliberate choice to run *more* ceremony than the playbook's tier rule requires.
2. **Gate A gains assertions-first:** Codex specifies what the A1/A2 partial-success
   banner tests must assert *before* Claude builds them, so the tests check intent rather
   than blessing Claude's implementation.
3. **Gate C gains real fixtures:** Codex has read access to the private spreadsheets
   (`JF Collection Database.xlsx`, `CP DB2.xlsx`, …) — its test-gap review should draw
   cases from those real messy sheets, not imagined ones.
4. **Two-user RLS isolation is a REQUIRED, BLOCKING part of Gate D** (Stephen,
   2026-08-02 — testers are planned soon, so a second real account is no longer
   hypothetical; this overrules Claude's earlier bonus-check proposal). The local stack
   seeds two users; the check proves user B cannot read or modify user A's rows or
   photos through the database or Storage, and vice versa.
5. **Clean-room discipline:** Codex receives only committed repository materials. Claude
   must **not** coach it through undocumented gaps — a gap that requires Claude's private
   memory *is the finding*, and gets written down as a reproducibility failure.

**Not subject to cross-model review** (ceremony exceeding risk): typos, documentation
wording with no behavioral effect, small Lite-tier visual tweaks, routine cache-marker
bumps, and low-risk extractions already fully characterized by passing tests that cross
no security or data-integrity boundary.

## Playbook tier map — skips APPROVED by Stephen 2026-08-02

| Item | Playbook default | Approved handling | Why |
|---|---|---|---|
| A3 paper-trail fix | Lite | **Skip tier** (docs/comments only, zero behavior) | One-line-fix class; browser verification of a README is meaningless |
| Phase B bootstrap | Lite | **Lite minus browser-verify** | Nothing in `app/` changes; the gate is `git status` + `npm test` output instead |
| Everything else | as marked above | **No skips** — Lite default, full tier where marked | A1/A2/A4 change save-path behavior; C touches import parsing (verbatim move + tests is the mitigation, but it still gets its Lite security pass) |

## Risks & honest limits

- **Playwright WebKit ≠ real iOS Safari.** Camera, HEIC quirks, popup timing still need
  the iPhone. The suite shrinks the manual gate; it doesn't remove it.
- **Cache staleness** is the main way extraction can hurt Stephen (stale lib + new
  page). Mitigation is Condition 6 + the iPhone check after the first extraction deploy.
- **The inline `<script>` block stays inline** for now (CSP `'unsafe-inline'` already
  accommodates it — see the header comment at `index.html:7`). Tightening CSP by moving
  the whole component out is a *later* prize at Phase F's end, not a near-term step.
- **Local Supabase means Docker/Colima on this Mac** (Gate 0, L3 — corrected from the
  stale free-tier-project text): a several-GB toolchain to install and occasionally
  update, and containers that must be running for e2e tests. Cloud test project exists
  only as a documented fallback if something can't be proven locally.
- **Rollback:** every phase is a small commit stack on its own branch; reverting the
  merge commit restores the prior state. The app itself keeps working untouched
  throughout — users notice nothing until a deploy, and each deploy is gated.

## Phase T — Tester-access safeguards (APPROVED by Stephen 2026-08-02; named phase per Gate 0, H4)

Stephen plans to have **testers soon**. This phase explicitly OVERRIDES, for itself
only, the "no schema changes / `supabase/functions/**` untouched" non-goals: a durable,
concurrency-safe rate limit needs an Edge Function change, server-side usage state
(likely a new table + migration + atomic function), and a rollback plan that covers
database objects, not just source. **Full tier** (auth surface + Edge Function), with
Codex security review.

**T1 — Scanner rate limit.** Gate (from Gate 0, H4 — all provable, none on the builder's
word): user identity comes from the verified session, never client input; limits enforce
atomically under concurrent requests (parallel calls cannot race past the counter); one
user cannot consume another's quota; a short burst limit exists in addition to the daily
cap; a global monthly kill-switch prevents the Anthropic call entirely; a rejected
request returns 429 *before* any paid model request; failure of the rate-limit store
fails safe (no unlimited fallback); no service-role credential reaches the browser;
tests use a stubbed model call and incur no charges; rollback covers the new database
objects.

**T2 — The other four tester protections (Gate 0's five-item list, adopted):**
1. **Public signup still disabled** — *re-verified* here; the actual shutdown happens
   immediately at **A0**, not at this phase (confirmation pass, B1).
2. **Production isolation proven** — that is Gate D2, a hard dependency of this phase.
3. **Manual offboarding documented** — how Stephen disables a tester and deletes their
   records/files on request; a doc, not a feature.
4. **A short tester notice** — plain-language: it's a test system, data may be removed,
   tag photos are sent to an AI service. Not a formal privacy policy.

Not pulled in (still out of scope until selling is close): billing, self-service
deletion/export, formal privacy program, public registration hardening.

**Ordering is explicit (Gate 0, H4): A0 → … → D1 → D2 → Phase T → first tester account.**
**Hard rule: no *human* tester account exists before Phase T's gate passes.** The single
exception (confirmation pass, M2): D2 may create one temporary, administrator-controlled
account solely for the production isolation test, deleted immediately afterwards.

## Deferred stabilization work (explicit, per Gate 0, M5/M8)

Deferred ≠ resolved. Phase A provides *interim compensation and visible partial-success
handling* — *not* final atomicity. So that banners are never mistaken for fixes, the
following remain open, with their trigger conditions:

| Deferred item | Revisit when |
|---|---|
| Server-side transactional consolidation (status+event, quantity+event, plant-create as one atomic operation) | After F6 (repository extraction) is test-covered |
| Integrity diagnostics (orphaned files, missing thumbnails, invalid covers, plants missing acquired events) | With F6, same machinery |
| Schema-version detection in the app | With D2's manifest tooling in place |
| Richer load-error taxonomy (offline vs auth-expired vs DB failure vs schema mismatch vs photo-signing) | After Phase A's generic state ships and real failures are observed |
| **Retry-on-partial-failure** — removed from Phase A by Stephen 2026-08-02 after Codex rounds 3+4 produced 8 findings, all inside the retry/notice machinery and none in the safety fixes themselves. Notices are now truthful but append-only, with no Retry. | Phase D, once Playwright can hold the failure combinations that defeated manual verification |
| Full photo-inclusive backup + proven restore drill | Explicitly deferred by Stephen (stability-first scope, 2026-07-29); revisit before selling |
| CSP tightening (removing `'unsafe-inline'` once the component leaves index.html) | End of Phase F |

## Order of work (summary)

**A0 (disable signup — ✅ DONE + verified 2026-08-02)** →
A (safety fixes, deploy) → B (tooling) →
C (pc-util + unit tests, deploy) → D1 (clean-room rebuild + e2e + local isolation) →
D2 (production parity) → T (tester safeguards) → *first tester account* → E (CI) →
F2…F6 (slices, each gated, Phase A regressions automated before F2). A0 takes a minute;
A could ship this week; F6 is months away and that's fine — every intermediate state is
stable and shippable.
