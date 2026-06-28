# How we work — Plant Collector DB

**Read this first, every session.** We build under **the Model-Paired Development Playbook**
(Stephen's friend's "three pillars" document).

- **Full playbook:** `docs/ModelPairedDev.pdf` (local, gitignored — it's the friend's doc, not ours to publish).
- **Working summary:** the `feedback-dev-method` memory (auto-loaded each session).
- **Project brain:** read `architecture.md` (design) + `decisions.md` (dated decision log) at the
  start of any non-trivial task, and write decisions back into them in the same change.

## The three pillars
1. **Markdown as the shared brain** — durable docs, not chat. Read before acting; write after.
2. **Separated adversarial personas** — Architect → Builder → Security → Tester as distinct
   sub-agents with different incentives. The reviewer must not be the author.
3. **Verification as a gate** — empirical proof (real command output, real counts, run the live
   app), never self-report. *Verify your verification.*

## Tier the ceremony to the risk
- **Skip** for typos, one-line fixes, config, and tweaks that mirror an existing pattern.
- **Lite (default):** plan (+ "Conditions for Builder") → build + inline tests → Security review →
  verify → one commit.
- **Full tier — spawn a REAL separate Security agent** (cost is not a constraint; Stephen, 2026-06-19):
  auth/RLS, public-guest access, **untrusted-file import**, new upload/egress paths, crypto, or any
  capability with no analog already shipped. *(Next up: spreadsheet import = full tier.)*

## Model rotation (friend's playbook)
- **Opus 4.8** → Architecture phase only (design, plan, trade-offs)
- **Sonnet 4.6** → Security review, Build, Test
Switch models in the model picker after the architecture plan is agreed and before building starts.

## House rules
- **Source control:** stage specific files (never `git add -A`); one logical change per commit;
  co-author tag; commit/push only when Stephen asks. **Deploy = `git push`** (GitHub Pages rebuilds;
  bump the `<meta name="app-build">` marker so the in-app updater offers it).
- **Verify in a real browser** before claiming UI works (Claude-in-Chrome + the `test@test.com`
  throwaway account; Chrome is Blink, so WebKit-specific bugs still need Stephen's iPhone).
- **Stephen is non-technical** — explain plainly, surface trade-offs with a recommendation, don't
  bury him in jargon.
