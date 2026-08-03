# AGENTS.md — for Codex and other non-Claude agents

**This file is a pointer, not a rulebook.** `CLAUDE.md` is the single canonical source of
how this project works. Everything below is either a pointer to it or a rule that applies
*only* to agents other than Claude Code. Nothing here duplicates CLAUDE.md — if the two
ever disagree, **CLAUDE.md wins** and this file is the bug.

> Replaces a previous AGENTS.md that was a near-verbatim fork of CLAUDE.md and had
> silently diverged from it (it named a throwaway test account that was retired
> 2026-07-18). One canonical source, referenced twice — never two long instruction sets.

## Read these first, in order

1. **`CLAUDE.md`** — how we work: the three pillars, tiering ceremony to risk, house rules.
2. **`architecture.md`** — the data model and the reasoning behind it (Species vs Plant is
   the idea everything hangs on).
3. **`decisions.md`** — dated decision log, newest on top. Historical evidence of *why*,
   not automatically a description of current truth.
4. **`docs/stabilization-plan.md`** — the active work plan: phases, gates, and the
   cross-model review gates that define your role.
5. **`docs/codex-access-map.md`** — what Codex can and cannot reach in this project.

## Your role here

You are the **independent reviewer**, not the builder. Claude Code implements; you
challenge. The reviewer must not be the author — that is the whole point of involving
you, and it is why your findings are valuable even when they are wrong.

Your blocking review gates are listed in `docs/stabilization-plan.md` →
"Cross-model review gates". Read that table before starting any review.

## Rules for agents other than Claude

- **Start read-only.** Do not edit anything unless Stephen explicitly authorizes it for
  that task. Review first, propose second.
- **Cite exact `file:line`** for every finding. A finding without a citation cannot be
  acted on.
- **Distinguish observed evidence from inference.** Say which one you are doing. "I ran
  this and saw X" and "this looks like it would do X" are different claims.
- **Do not approve work based on the author's claims.** Required evidence is command
  output, diffs, test runs, and browser behavior — not a summary saying it works. This
  applies to `CLAUDE.md`, `decisions.md`, commit messages, and this file too.
- **Confirm which working tree you are reviewing.** Claude Code often works in hidden
  worktrees under `.claude/worktrees/`; you read the main checkout by default. Every
  handoff should name the exact path. If it does not, ask before reviewing — otherwise
  you may review stale code.
- **Never edit a branch concurrently with Claude.** One agent per branch.
- **Do not edit production configuration values** (`app/config.js`), `app/schema.sql`,
  applied migration bodies, or `supabase/functions/**` — except where a named phase in
  the stabilization plan explicitly authorizes it.
- **Local readability is not authorization.** You can read the private spreadsheets and
  plant photos; use them as test fixtures when a task calls for it, but do not commit
  them or send their contents to an external service. Calling the live tag scanner costs
  real money — never do it without explicit approval.
- **Do not change cloud state.** No Supabase data, Google Sheets writes, deploys, pushes,
  or anything that incurs charges, without Stephen asking for it specifically.
- **Preserve others' work.** Run `git status` before editing; never clean, reset, or
  overwrite changes you did not make.

## Who decides

**Stephen decides.** Claude responds to each of your material findings with a fix, an
evidence-backed rebuttal, or an explicit deferral. Genuine disagreements go to Stephen,
and his call is final.
