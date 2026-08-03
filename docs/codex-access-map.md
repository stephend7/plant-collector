# Codex access map

**Observed:** 2026-08-02  
**Project:** `/Users/stephendavis/Documents/2- Plant Collector DB`  
**Purpose:** Tell Claude exactly what Codex can see and change when the two agents collaborate on this project.

> This is a snapshot of the permissions available to Codex in the session where this document was created. App permissions can change between sessions, so Codex should re-check before relying on this for a destructive, external, or Git-writing operation.

## Short version

Codex can currently read every file discovered inside the project, including tracked source code, ignored spreadsheets, plant photographs, the private development-playbook PDF, Claude settings, Claude worktrees, and Git history.

Codex can edit ordinary files anywhere under the project root when Stephen asks it to implement a change. The `.git` directory is exposed as read-only, so operations that write Git metadata may require additional permission. Local file access does not automatically provide credentials or administrative access to Supabase, Anthropic, Google Cloud, Google Drive, or GitHub.

The verification performed when this document was created found zero unreadable project files.

## Primary working directory

Codex's primary project directory is:

```text
/Users/stephendavis/Documents/2- Plant Collector DB
```

Ordinary files and directories beneath that path are writable by Codex when Stephen authorizes a change. This includes creating test files, test fixtures, documentation, local configuration, and source-code changes.

Codex also has a separate writable visualization/scratch area:

```text
/Users/stephendavis/.codex/visualizations/2026/07/23/019f8d06-1735-74b2-9902-aa504df5f03f
```

That second directory is not the Plant Collector repository and should not be treated as part of the deployable application.

## Tracked application files Codex can read

At the time of inspection, the Git repository contained 32 tracked files. Codex can read all of them.

### Application shell and configuration

- `.gitignore`
- `.nojekyll`
- `app/config.js`
- `app/index.html`
- `app/schema.sql`

### Vendored browser code

- `app/lib/alpine.min.js`
- `app/lib/exifr.min.js`
- `app/lib/heic2any.min.js`
- `app/lib/import-worker.js`
- `app/lib/supabase.min.js`
- `app/lib/xlsx.full.min.js`

### Database migrations

- `app/migrations/001_acquisition_type_and_source_url.sql`
- `app/migrations/002_photo_label_plant_flower.sql`
- `app/migrations/003_event_log_and_care_fields.sql`
- `app/migrations/004_multi_photo_journal_entries.sql`
- `app/migrations/005_import_batch_and_date_precision.sql`
- `app/migrations/006_pest_reference_and_journal_pest.sql`
- `app/migrations/007_photo_in_gallery.sql`
- `app/migrations/008_multi_pest_per_event.sql`
- `app/migrations/009_plant_country.sql`
- `app/migrations/010_inventory_last_seen.sql`
- `app/migrations/011_sheet_link_and_sheet_oauth.sql`
- `app/migrations/README.md`

### Edge Function

- `supabase/functions/scan-tag/index.ts`

### Project documentation

- `CLAUDE.md`
- `architecture.md`
- `decisions.md`
- `vision.md`
- `ux-notes.md`
- `docs/scan-tag-plan.md`
- `docs/sheets-sync-plan.md`
- `docs/spreadsheet-import-plan.md`

## Untracked and ignored local material Codex can read

These files do not all belong in the public Git repository, but Codex can read them locally when they are relevant to an authorized task.

### Working instructions and private playbook

- `AGENTS.md` — currently untracked; contains the active project workflow instructions.
- `docs/ModelPairedDev.pdf` — private, ignored source playbook.
- `.claude/launch.json`
- `.claude/settings.local.json`

Codex should not quote or publish private contents merely because they are readable.

### Private spreadsheet fixtures

- `CP DB2.xlsx`
- `CP Database 02-25.xlsx`
- `Copy of Gianes 0_Plant Collection.xlsx`
- `JF Collection Database.xlsx`

Codex can use these for local import/parser testing. It should not commit them or send their contents to an external service without Stephen's explicit authorization.

### Local photographs and screenshots

- Thirteen JPEG files under `Photos - Just purchased plants want to enter them into the database/June 16, 2026/`
- `Claude to ignore/Screenshot 2026-07-07 at 6.11.24 PM.png`

Codex can use the photographs as local image-processing, EXIF, crop, upload, and tag-scanner fixtures. Calling the live Anthropic-backed scanner is a separate external and potentially chargeable action; local readability is not authorization to do that.

### Incidental files

Codex can see `.DS_Store` files in several directories. They are not useful application inputs.

## Claude worktrees Codex can see

Codex can read the following working copies under `.claude/worktrees/`:

- `busy-greider-dc4153`
- `dazzling-euler-ebb97f`
- `docs-review-13779c`
- `docs-review-703b1a`
- `plant-tag-reading-speed-575ae7`
- `recursing-lalande-8f9384`
- `wizardly-meitner-0f7aa1`

These are separate working trees, not duplicate paths to the main checkout. Codex should treat them as Claude-owned unless Stephen or Claude explicitly asks Codex to inspect or coordinate with a specific worktree. An edit in one of these worktrees does not automatically edit the main working tree.

## Git visibility and limitations

Codex can currently read:

- Git status and diffs
- Commit history
- Branch, ref, and worktree information
- Git objects and repository configuration
- The configured `origin` URL

State observed when this document was created:

```text
Branch: main
HEAD: 1724118
Remote: https://github.com/stephend7/plant-collector.git
Untracked: AGENTS.md
```

The session sandbox exposes `.git` as read-only. Codex can therefore inspect repository state, but staging, committing, creating or switching branches, merging, fetching, and other Git operations that write repository metadata may require approval or expanded access.

Source-file write permission and Git-metadata write permission are separate. Codex may be able to implement and test a change while still being unable to stage or commit it.

## What Codex cannot infer from local files

Local project access does not, by itself, provide:

- A Supabase database password
- A Supabase service-role key
- The live Anthropic API key
- A test user's password
- Administrative access to live Supabase Auth settings
- Direct access to live Postgres rows or Supabase Storage objects
- Anthropic usage or billing logs
- Google Cloud Console configuration
- A guaranteed authenticated Google Drive session
- A guaranteed authenticated GitHub session

`app/config.js` contains public browser identifiers, including a Supabase publishable key and Google public client/API identifiers. Those are not administrative credentials.

Some installed Codex connectors may provide access to services such as GitHub or Google Drive when explicitly used. Connector availability and login state are separate from filesystem access and should be checked at the time of the task.

## Best setup for shared adversarial testing

Claude and Codex should prefer testing against local or disposable systems rather than Stephen's real collection.

Useful shared resources would be:

1. A complete local Supabase configuration whose migrations recreate the entire schema.
2. Seed data with at least two users so ownership and RLS boundaries can be tested adversarially.
3. Small synthetic import fixtures plus the existing private spreadsheets for realistic local parsing.
4. A designated disposable Google Sheet for the few tests that genuinely require Google OAuth.
5. An explicitly disposable Supabase project only when local Supabase cannot prove the behavior.
6. A secure, non-repository way to use a throwaway-account login for live browser verification.
7. Explicit Git-metadata permission when Stephen wants Codex to stage, branch, commit, merge, or fetch.

Passwords, service-role keys, refresh tokens, and database credentials should not be committed to this repository merely to make them available to either agent.

## Coordination rules for Claude

When handing work to Codex, Claude can assume:

- Codex can inspect any relevant local project file without asking Stephen to move or duplicate it.
- Codex can inspect the ignored spreadsheets and image fixtures when the task calls for them.
- Codex can make ordinary project-file changes when Stephen has requested implementation.
- Codex cannot assume permission to change cloud data, send images to Anthropic, write Google Sheets, deploy, push, or incur charges.
- Codex should re-check `git status` before editing because Claude may have active work in another worktree or the main checkout.
- Codex should preserve unrelated user or Claude changes and should not clean, reset, or overwrite them.
- Browser automation, connector access, network access, and Git writes are capabilities to verify per session; they are not guaranteed by this document.

## Verification record

The following read-only checks supported this access map:

- Enumerated tracked files with `git ls-files`.
- Enumerated ignored and hidden files while excluding `.git` internals from the primary-file count.
- Performed a readability check across all discovered project files: zero unreadable files.
- Read Git history successfully.
- Listed the configured Git remote successfully.
- Inspected the sandbox's declared writable roots and read-only `.git` permission.

No private file contents, cloud data, or external services were changed while producing this document.
