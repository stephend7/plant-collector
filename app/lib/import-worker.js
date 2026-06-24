/* import-worker.js — the untrusted-file PARSE SANDBOX (full-tier control).
 *
 * Why a Worker: this is the only place a malicious/malformed workbook is parsed.
 * A Worker has NO DOM, NO window, NO Supabase client, NO auth token, NO storage.
 * So even a parser exploit here cannot read the user's session or touch the database.
 * It returns only plain strings in arrays — never objects keyed by cell/header text,
 * which is also why prototype-pollution via a crafted "__proto__" header is a non-issue
 * (we never use untrusted text as an object key anywhere in this file).
 *
 * Hard caps:
 *   - file size + sheet count are checked right after read, before we touch any sheet.
 *   - rows/cols: the chosen sheet is materialized through a CLAMPED range (derived from its
 *     !ref but bounded to CAP.ROWS x CAP.COLS), so a hostile !ref declaring millions of
 *     cells can't make sheet_to_json OOM — it only ever walks the bounded range.
 *   - per-cell length is TRUNCATED (with a counted warning) so one giant cell can't OOM us.
 * Residual we DON'T fully prevent: a zip-decompression bomb inside XLSX.read itself (xlsx is
 *   zipped XML and can inflate massively before we see any !ref). That is CONTAINED by Worker
 *   ISOLATION — it can crash this parse thread, but not the app: the main thread's worker
 *   onerror handler recovers and tells the user. We accept that rather than re-implement unzip.
 * Formulas are inert: we read cached VALUES only (cellFormula:false) and never evaluate.
 * Date cells come back as ISO 'YYYY-MM-DD' strings; everything else as String().
 */
'use strict';

importScripts('xlsx.full.min.js');   // resolves relative to this worker file

var CAP = {
  BYTES: 15 * 1024 * 1024,   // 15 MB
  SHEETS: 60,
  ROWS: 10000,
  COLS: 100,
  CELL: 8000                 // chars; longer cells are truncated + counted
};

var WB = null;               // the parsed workbook, kept between 'load' and 'rows'

function fail(msg) { postMessage({ ok: false, error: msg }); }

function isoDate(d) {
  if (isNaN(d)) return '';
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

// Coerce ANY cell to a safe transport string. Dates -> ISO; numbers/bools -> String.
// Truncate over-long cells and report how many were cut.
function cellToString(v, counters) {
  if (v === null || v === undefined) return '';
  var s;
  if (v instanceof Date) s = isoDate(v);
  else s = String(v);
  if (s.length > CAP.CELL) { counters.truncated++; s = s.slice(0, CAP.CELL); }
  return s;
}

onmessage = function (e) {
  var msg = e.data || {};
  try {
    if (msg.kind === 'load') {
      var buf = msg.buffer;
      if (!buf || typeof buf.byteLength !== 'number') return fail('No file data received.');
      if (buf.byteLength > CAP.BYTES)
        return fail('That file is ' + Math.round(buf.byteLength / 1048576) +
                    ' MB — over the ' + (CAP.BYTES / 1048576) + ' MB import limit.');
      // VALUES only: no formula objects, no HTML rendering, dense off. cellDates gives Dates.
      WB = XLSX.read(new Uint8Array(buf), {
        type: 'array', cellDates: true, cellFormula: false,
        cellHTML: false, cellStyles: false, sheetStubs: false, dense: false
      });
      var names = (WB.SheetNames || []);
      if (names.length > CAP.SHEETS) { WB = null; return fail('That workbook has ' + names.length +
        ' tabs — over the ' + CAP.SHEETS + '-tab limit.'); }
      // Report each tab's name + a rough row count so the user can pick.
      var sheets = names.map(function (nm) {
        var ws = WB.Sheets[nm];
        var ref = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
        return { name: String(nm), rows: ref ? (ref.e.r - ref.s.r + 1) : 0,
                 cols: ref ? (ref.e.c - ref.s.c + 1) : 0 };
      });
      return postMessage({ ok: true, kind: 'sheets', sheets: sheets });
    }

    if (msg.kind === 'rows') {
      if (!WB) return fail('No workbook loaded. Re-pick the file.');
      var name = String(msg.sheetName || '');
      var ws = WB.Sheets[name];
      if (!ws) return fail('That tab was not found in the workbook.');
      var counters = { truncated: 0 };
      // header:1 -> array-of-arrays (NO objects keyed by header text). raw:false would
      // re-format; we pass raw values through cellToString ourselves for full control.
      // Bound the range to the caps BEFORE materializing, so a giant declared !ref can't OOM.
      var capped = false, opts = { header: 1, raw: true, defval: '', blankrows: false };
      if (ws['!ref']) {
        var ref = XLSX.utils.decode_range(ws['!ref']);
        if (ref.e.r - ref.s.r + 1 > CAP.ROWS) { ref.e.r = ref.s.r + CAP.ROWS - 1; capped = true; }
        if (ref.e.c - ref.s.c + 1 > CAP.COLS) { ref.e.c = ref.s.c + CAP.COLS - 1; }
        opts.range = ref;
      }
      var aoa = XLSX.utils.sheet_to_json(ws, opts);
      if (aoa.length > CAP.ROWS) { aoa = aoa.slice(0, CAP.ROWS); capped = true; }
      var out = [];
      for (var r = 0; r < aoa.length; r++) {
        var row = aoa[r] || [];
        var n = Math.min(row.length, CAP.COLS);
        var cells = new Array(n);
        for (var c = 0; c < n; c++) cells[c] = cellToString(row[c], counters);
        // drop fully-empty rows (common separator rows)
        if (cells.some(function (x) { return x !== ''; })) out.push(cells);
      }
      return postMessage({ ok: true, kind: 'rows', sheetName: name, rows: out,
        truncatedCells: counters.truncated, rowCapped: capped, rowCap: CAP.ROWS });
    }

    if (msg.kind === 'reset') { WB = null; return; }

    return fail('Unknown request.');
  } catch (err) {
    WB = null;
    fail('Could not read that file — it may be corrupt or not a real spreadsheet. (' +
         (err && err.message ? err.message : 'parse error') + ')');
  }
};
