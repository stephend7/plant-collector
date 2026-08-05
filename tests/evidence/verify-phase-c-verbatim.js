#!/usr/bin/env node
/* Gate C verbatim-move proof, v2 — rewritten after Codex's Gate C review (P1-3) found the
 * v1 checker's claims did not match what it actually verified.
 *
 * What was wrong with v1: it collected all removed/added lines from `git diff` into
 * TRIMMED, UNORDERED Sets, then checked Set membership. That is blind to statement
 * reordering, dropping one of several identical lines, and any whitespace-only change —
 * while being described as "byte-for-byte" proof. It also read the library from the
 * mutable WORKING TREE rather than the specific commit under review, so its result was
 * not reproducible against a pinned commit pair. Two of Codex's ten adversarial
 * mutations exploited exactly this (a duplicate-line drop, a statement reorder) and the
 * old checker reported PASS on both even though real behavioral bugs resulted.
 *
 * How v2 is different:
 *  - Reads BOTH files from git blobs at the exact commits given on the command line
 *    (default a48e6be = main before Phase C, 753e0cf = the verbatim-move commit) —
 *    never the working tree. Re-run this against different commits to check different
 *    claims; it does not silently drift as later commits land.
 *  - Diffs with `-U0` (zero context) so git itself splits the change into hunks that are
 *    each PURELY removed lines, PURELY added lines, or a single 1-for-1 modify — no
 *    manual line classification, no trimming.
 *  - A removed hunk's exact multi-line text (order, multiplicity, and whitespace
 *    preserved — literally NOT trimmed) must appear as a contiguous substring of the new
 *    file. This is what actually earns "byte-for-byte for the moved regions": reordering
 *    or dropping one of several identical lines changes the block's text and is caught.
 *  - An added hunk's lines must match a sanctioned line by EXACT equality (not a prefix
 *    regex) computed from the new file's own app-build value, so a mutation that
 *    appends extra content after a sanctioned line no longer slips through.
 *  - Five checks that a pure text diff can never make, run separately: exact export-list
 *    equality in BOTH the Node (require) branch and a simulated browser (module-less vm
 *    context) branch, script load order, CSP compatibility, and cache-marker equality
 *    between the script's `?v=` and `<meta app-build>`.
 *
 * What this still cannot prove, on purpose (not silently — said here): if a declaration
 * is wrapped in a block comment so it's textually present but dead, the substring check
 * still finds the text and cannot tell it apart from live code. That specific mutation is
 * caught elsewhere instead — the export/wrapper checks below call vm.runInContext on the
 * real factory function, and a commented-out declaration that's still referenced in the
 * returned object literal throws a ReferenceError immediately, which this script reports
 * as a failure. Two different failure modes, two different checks; neither replaces the
 * other.
 */
'use strict';
const { execFileSync } = require('child_process');
const vm = require('vm');

const OLD = process.argv[2] || 'a48e6be';
const NEW = process.argv[3] || '753e0cf';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function blob(commit, path) {
  return git('show', `${commit}:${path}`);
}

// ---------- parse a -U0 diff into hunks, each tagged with its shape ----------
function parseHunks(diffText) {
  const lines = diffText.split('\n');
  const hunks = [];
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('@@')) i++;
  while (i < lines.length && lines[i].startsWith('@@')) {
    const header = lines[i]; i++;
    const removed = [], added = [];
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const l = lines[i];
      if (l.startsWith('-')) removed.push(l.slice(1));
      else if (l.startsWith('+')) added.push(l.slice(1));
      // -U0 emits nothing else between hunks except these two prefixes
      i++;
    }
    hunks.push({ header, removed, added });
  }
  return hunks;
}

const failures = [];
const notes = [];

// ============ 1. verbatim-move + sanctioned-addition check, hunk by hunk ============
const newIndexHtml = blob(NEW, 'app/index.html');
const newLib = blob(NEW, 'app/lib/pc-util.js');

const diffText = git('diff', '--no-color', '-U0', `${OLD}..${NEW}`, '--', 'app/index.html');
const hunks = parseHunks(diffText);

const buildMatch = newIndexHtml.match(/<meta name="app-build" content="([^"]+)">/);
const buildValue = buildMatch && buildMatch[1];

const scriptTagLine = buildValue ? `<script src="lib/pc-util.js?v=${buildValue}"></script>` : null;
const SANCTIONED_ADDED_LINES = new Set([
  scriptTagLine,
  '  // Phase C extraction (docs/stabilization-plan.md) — pure helpers now live in lib/pc-util.js;',
  '  // aliased locally so every existing call site below is unchanged.',
  '  const {uid, isHeic, thumbOf, todayLocal, sameSet,',
  '    escapeRe, collectStrings, extractEpithet, matchGenusSpeciesFromString, matchGenusSpecies, exifDateOf,',
  '    IMPORT_MONTHS, normWS, normQuotes, normKey, pad2, expandYear,',
  '    parseImportDate, parseCombinedName, scrapePrice, cleanPrice, guessImportMap, guessStatus, LIFECYCLE_STATUSES} = PCUtil;'
].filter(Boolean));

let buildBumpSeen = false;
let removedBlockCount = 0, addedLineCount = 0;

for (const h of hunks) {
  const isPureRemove = h.removed.length > 0 && h.added.length === 0;
  const isPureAdd = h.added.length > 0 && h.removed.length === 0;
  const isOneForOneModify = h.removed.length === 1 && h.added.length === 1;

  if (isOneForOneModify) {
    if (/^<meta name="app-build"/.test(h.removed[0]) && /^<meta name="app-build"/.test(h.added[0])) {
      buildBumpSeen = true;
      continue; // checked properly in §3 (cache-marker equality)
    }
    failures.push(`UNEXPECTED 1-for-1 modify hunk (only the app-build bump is sanctioned):\n  ${h.header}\n  - ${h.removed[0]}\n  + ${h.added[0]}`);
    continue;
  }

  if (isPureRemove) {
    removedBlockCount++;
    const block = h.removed.join('\n');
    if (!newLib.includes(block)) {
      failures.push(`Removed block from index.html NOT found verbatim (order+content+whitespace) in pc-util.js:\n----\n${block}\n----`);
    }
    continue;
  }

  if (isPureAdd) {
    for (const line of h.added) {
      addedLineCount++;
      if (!SANCTIONED_ADDED_LINES.has(line)) {
        failures.push(`UNSANCTIONED added line (exact match required): ${JSON.stringify(line)}`);
      }
    }
    continue;
  }

  failures.push(`UNEXPECTED hunk shape (mixed removed+added, not the one sanctioned 1-for-1 modify):\n  ${h.header}`);
}

if (!buildBumpSeen) failures.push('Expected exactly one app-build version-bump hunk; none found.');

// ============ 2. export-list equality, Node branch AND browser branch ============
const EXPECTED_EXPORTS = [
  'uid', 'isHeic', 'thumbOf', 'todayLocal', 'sameSet',
  'escapeRe', 'collectStrings', 'extractEpithet', 'matchGenusSpeciesFromString', 'matchGenusSpecies', 'exifDateOf',
  'IMPORT_MONTHS', 'normWS', 'normQuotes', 'normKey', 'pad2', 'expandYear',
  'parseImportDate', 'parseCombinedName', 'scrapePrice', 'cleanPrice', 'guessImportMap', 'guessStatus', 'LIFECYCLE_STATUSES'
].sort();

function evalAsNode(source) {
  const moduleObj = { exports: {} };
  const context = vm.createContext({ module: moduleObj, crypto: globalThis.crypto });
  vm.runInContext(source, context, { filename: 'pc-util.js (node branch)' });
  return moduleObj.exports;
}
function evalAsBrowser(source) {
  const context = vm.createContext({ crypto: globalThis.crypto }); // deliberately no `module`
  vm.runInContext(source, context, { filename: 'pc-util.js (browser branch)' });
  return context.PCUtil;
}
function checkExports(label, obj) {
  if (!obj || typeof obj !== 'object') { failures.push(`${label}: exports missing or not an object`); return; }
  const actual = Object.keys(obj).sort();
  const missing = EXPECTED_EXPORTS.filter(k => !actual.includes(k));
  const extra = actual.filter(k => !EXPECTED_EXPORTS.includes(k));
  if (missing.length) failures.push(`${label}: missing export(s): ${missing.join(', ')}`);
  if (extra.length) failures.push(`${label}: unexpected extra export(s): ${extra.join(', ')}`);
}

try {
  checkExports('Node branch (require)', evalAsNode(newLib));
} catch (e) {
  failures.push(`Node branch threw evaluating pc-util.js: ${e.message}`);
}
try {
  checkExports('Browser branch (module-less vm context)', evalAsBrowser(newLib));
} catch (e) {
  failures.push(`Browser branch threw evaluating pc-util.js: ${e.message}`);
}

// ============ 3. script order, CSP, cache-marker equality ============
const scriptTagIdx = newIndexHtml.indexOf('<script src="lib/pc-util.js?v=');
const inlineScriptIdx = newIndexHtml.indexOf('<script>\n  const sb = supabase.createClient');
if (scriptTagIdx === -1) failures.push('pc-util.js script tag not found in index.html');
if (inlineScriptIdx === -1) failures.push('Main inline <script> block not found in index.html');
if (scriptTagIdx > -1 && inlineScriptIdx > -1 && scriptTagIdx > inlineScriptIdx) {
  failures.push('pc-util.js script tag loads AFTER the inline script that aliases from it');
}

const cspMatch = newIndexHtml.match(/Content-Security-Policy" content="([^"]*)"/);
if (!cspMatch || !/script-src[^;]*'self'/.test(cspMatch[1])) {
  failures.push("CSP script-src no longer allows 'self' scripts (pc-util.js would be blocked)");
}

const scriptSrcMatch = newIndexHtml.match(/<script src="lib\/pc-util\.js\?v=([^"]+)"><\/script>/);
if (!scriptSrcMatch) {
  failures.push('Could not find the pc-util.js script tag with a ?v= marker');
} else if (!buildValue) {
  failures.push('Could not find <meta name="app-build"> in index.html');
} else if (scriptSrcMatch[1] !== buildValue) {
  failures.push(`Cache-marker mismatch: script ?v=${scriptSrcMatch[1]} vs app-build=${buildValue}`);
}

// ============ report ============
console.log(`diff range              : ${OLD}..${NEW}`);
console.log(`removed blocks checked  : ${removedBlockCount}`);
console.log(`added lines checked     : ${addedLineCount}`);
console.log(`app-build               : ${buildValue}`);
console.log(`script ?v=              : ${scriptSrcMatch && scriptSrcMatch[1]}`);
console.log(`export count (expected) : ${EXPECTED_EXPORTS.length}`);
console.log();

if (failures.length) {
  console.log(`FAIL — ${failures.length} issue(s):\n`);
  failures.forEach((f, n) => console.log(`${n + 1}. ${f}\n`));
  if (notes.length) notes.forEach(n => console.log('NOTE: ' + n));
  process.exit(1);
}
console.log('PASS — verbatim move, sanctioned additions, both export branches, script order,');
console.log('CSP compatibility, and cache-marker equality all hold between these two commits.');
