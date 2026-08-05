# Gate C round 1 — live verification evidence (conditions 4 and 5)

Codex's Gate C round 1 review correctly rejected the earlier substitute evidence as
prose-only and not reproducible (P1-5), and ruled that calling PCUtil functions directly
is below the required boundary for the import-preview condition (P1-4: the real file
input → worker parse → mapping inference → rendered preview must be exercised). This
file is the reproducible record for both, run against commit `fb9c507` on branch
`phase-c-pc-util-extraction`, worktree `docs-review-13779c`, `file://` mode.

No screenshot binaries are attached — this tool's screenshots are transmitted in-session
and are not retrievable from disk afterward. What follows instead is the exact
reproduction procedure plus the raw text/console captures taken at each step, which a
reviewer can re-run to get the identical result rather than trust a static image.

---

## Condition 4 — real import-preview pipeline

**Why direct parser calls weren't enough (Codex P1-4):** they exercise `PCUtil.*` in
isolation, never the actual file input, the Web Worker parse (`app/lib/import-worker.js`
+ the vendored `xlsx.full.min.js`), or the rendered mapping/preview screens.

**Why a native OS file-picker dialog can't be driven here, and what was done instead:**
this Browser pane's tooling has no `file_upload`-style capability, so the native picker
can't be scripted directly. Per Codex's own allowance ("a native OS picker does not
itself need special testing if automation can supply the file to the actual input"),
the real bytes of a private-spreadsheet local fixture (5,868 bytes; readable locally per
AGENTS.md, contents intentionally not quoted anywhere in this file since the repo is
public) were:

1. Read from disk in Node (`fs.readFileSync`), base64-encoded, and written to a temporary
   file the page could load as an ordinary same-origin script — avoiding hand-transcribing
   a 7,824-character string into a tool call. (A first attempt that DID hand-transcribe it
   produced a corrupted, duplicated 15,947-byte blob — caught by checking the decoded
   length against the real file size before trusting the result. That temp file,
   `app/__test_fixture.js`, was never committed and has been deleted.)
2. In the live page: decoded via `atob`, wrapped in a real `File` object, attached to a
   real `DataTransfer`, and assigned to the actual `<input type="file" accept=".xlsx,.xls,.csv">`
   at `app/index.html:2054` via `input.files = dt.files` — a browser-supported
   `HTMLInputElement.files` setter, not a security bypass (the script already had the
   exact bytes; nothing was read from the user's disk without already having it).
3. Dispatched a real `change` event so Alpine's `@change="onImportFile($event)"` fired
   through the actual, unmodified handler (`app/index.html:5210`).

**A false negative worth recording:** the first two real attempts appeared to fail
(`input.files.length` read back as `0` immediately after dispatch). This was not a bug —
`onImportFile`'s first line is `ev.target.value=''`, which the app does deliberately so
the same file can be re-picked later. Checking `input.files.length` after the handler has
already run was the wrong signal; the right signal is the app's own rendered state, below.

**Result — the mapping screen** (after the worker parsed the real file and the app's
`guessImportMap`/header-inference ran):
- Combined name → correctly mapped to the fixture's species-name column. (The label under
  it, `"Nepenthes ampullaria 'Lime Twist', BE-3390"`, is a **static UI hint baked into
  `app/index.html:2146`** — it always shows regardless of the uploaded file's content and
  predates Phase C entirely (present on `main` since commit `72f4e73`). An earlier draft of
  this evidence file mischaracterized it as sample text pulled from the uploaded fixture;
  it is not — corrected here. Codex's P2-2 finding on a related mischaracterization is
  accepted; this is the same category of error, now fixed at the source.)
- Vendor/source, Acquisition date, Accession/clone ID, Location data, and Notes all mapped
  to the correct columns — every mapping matched the fixture's real header row exactly
  (confirmed independently in Node earlier this session; the header text itself is not
  reproduced here, same reasoning as above).

**Result — the rendered preview** (`get_page_text` capture; row content redacted, counts
and structural claims are not — the fixture is a private third party's spreadsheet and
this repo is public, so its content is not reproduced here even though it was legitimately
read locally per AGENTS.md):

- Summary tiles: **6 plants, 2 new genera, 6 new species, 4 new vendors** — matches the
  fixture's known row/genus/vendor counts exactly (confirmed independently in Node earlier
  this session; the underlying values are not reproduced here).
- All 6 rows' Genus/Species/Vendor/Date columns were spot-checked against the same file
  read independently in Node and matched exactly, field for field.
- One row contained a lowercase hybrid marker mid-string (between two epithets) and
  rendered with the literal lowercase `x` preserved verbatim, unmodified. **Correction:**
  an earlier draft of this file claimed this row demonstrated the leading-hybrid
  normalization gap — Codex's P2-2 finding, accepted. It does not, for a more basic reason
  than P2-2 states: the import path calls `parseCombinedName` (`app/index.html:4920,
  4931, 5331`), which never attempts hybrid-marker normalization at all — it splits the
  genus token and keeps everything else verbatim by design. The `x`→`×` normalization
  logic (and its leading-marker bug) lives only in `matchGenusSpeciesFromString`, a
  separate function used solely by the photo-filename/EXIF auto-detect feature
  (`app/index.html:2538`), never by the spreadsheet importer. This row is therefore
  neither a demonstration of the gap nor a regression — `parseCombinedName` did exactly
  what it is designed to do. The leading-hybrid gap remains covered by the synthetic
  `LEGACY`/`INTENDED` test pair in `pc-util.test.js`, which exercises the correct function.

`read_console_messages` immediately after Preview rendered: **no entries** (clean).

**Not committed to the database** — Codex's ruling: "No commit-to-database operation is
required. The criterion says preview, not completed import." Closed the dialog via the
X control without tapping "Import 6 plants"; collection count confirmed unchanged
(18 plants / 14 Pinguicula, same as the pre-test baseline) via a follow-up `get_page_text`.

---

## Condition 5 — reproducible add-plant flow evidence

Same live session, same signed-in throwaway test account (address kept in Claude's
private memory per `CLAUDE.md`, not committed here — this repo is public).

**Baseline** (`get_page_text` before starting): `18 plants · 2 genera`, `Pinguicula 14 plants`.

**Steps:** tapped the add-plant FAB → genus defaulted to `Pinguicula` (sticky from a prior
session) → acquisition-date field pre-filled `2026-08-04` by `todayLocal()` through the
`PCUtil` alias — this is today's real date at the time of the run, confirming the Gate C
round-1 date-parser fix didn't regress the unrelated `todayLocal` function it sits next to
→ opened the species picker, selected the existing `esseriana` record (sorted first,
most-recently-used) → scrolled to confirm `Acquisition date: 08/04/2026` in the rendered
form → tapped **Save plant**.

**Immediately after save**, `read_console_messages` (unfiltered, not `onlyErrors`) returned
exactly one entry:
```
[error] Failed to load resource: the server responded with a status of 400 ()
```
This was checked, not dismissed. Source: `openForm()` (`app/index.html:3276`) calls
`warmScanFn()` (`app/index.html:2506-2517`), a fire-and-forget ping to the `scan-tag` Edge
Function meant to boot it before the user finishes filling the form — the function is
POSTed an empty body specifically so it rejects fast with **an intentional, documented
400** ("fails fast server-side (400, no model call)", `app/index.html:2506`) rather than
run a real model call. The call is wrapped in `.catch(()=>{})` in the app's own code, so it
never surfaces as a user-visible error — the browser's own resource-load log still prints
it regardless of the `.catch()`. This is pre-existing behavior, present before Phase C and
unrelated to it; confirmed by reading the exact source lines rather than assumed.

**`get_page_text` on the saved plant's detail page:**
```
Pinguicula esseriana
Quantity 1   Status In collection   Growing spot Not set   Vendor —
Acquired 2026-08-04
...
JOURNAL
2026-08-04   Acquired
Delete plant
```
The `Acquired` journal event's presence and date confirm `PCUtil.uid()` (event id) and
`PCUtil.todayLocal()` (event date) both fired correctly through the real Supabase write
path, not just in the Node/browser-branch unit tests.

**Cleanup:** used the app's own arm-then-confirm delete control (`double_click` on
"Delete plant" — the same control the Phase A safety-fixes phase added, first tap arms
"Tap again to delete", second tap commits). `get_page_text` afterward confirmed
`Pinguicula 14 plants` with a single `esseriana ×12` entry — back to the exact pre-test
baseline, no residue.

---

## Summary

| Condition | Result |
|---|---|
| 4. Real import-preview pipeline | Exercised via a real `File`/`DataTransfer` injection into the actual input; worker parse, header mapping, and rendered preview all confirmed against the real fixture; not committed to the database per Codex's own ruling |
| 5. Reproducible add-plant evidence | Exact steps and raw `get_page_text`/console captures recorded above; one console entry appeared and was traced to a pre-existing, documented, intentional warm-up-ping 400, not a regression; cleanup verified by page-text diff, not assumed |
