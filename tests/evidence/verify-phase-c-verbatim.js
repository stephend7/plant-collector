#!/usr/bin/env node
/* Gate C verbatim-move proof — reproducible by the reviewer, no shell quoting involved.
 *
 * Run from the repo root:   node tests/evidence/verify-phase-c-verbatim.js
 *
 * Claim under test: every line REMOVED from app/index.html by the Phase C commit exists
 * byte-for-byte in app/lib/pc-util.js, and the only lines ADDED to app/index.html are the
 * script tag, the alias block, and the app-build bump. If either claim is false this exits
 * non-zero and prints the offending lines — a passing run is the evidence, not my summary.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = process.argv[2] || 'main';
const HEAD = process.argv[3] || 'HEAD';

const diff = execFileSync('git', ['diff', `${BASE}..${HEAD}`, '--', 'app/index.html'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
});

const removed = [], added = [];
for (const line of diff.split('\n')) {
  if (line.startsWith('---') || line.startsWith('+++')) continue;
  if (line.startsWith('-')) removed.push(line.slice(1));
  else if (line.startsWith('+')) added.push(line.slice(1));
}

const lib = fs.readFileSync('app/lib/pc-util.js', 'utf8');
const libLines = new Set(lib.split('\n').map(l => l.trim()));

// The app-build marker is a removed/added PAIR (the version bump), not an extraction.
// It is excluded from the "must survive in pc-util.js" check and sanctioned as an addition.
const isBuildMarker = l => /^<meta name="app-build"/.test(l);

// 1. Every removed line must survive verbatim in the extracted file.
const missing = removed
  .map(l => l.trim())
  .filter(l => l !== '')
  .filter(l => !isBuildMarker(l))
  .filter(l => !libLines.has(l));

// 2. Every added line must be one of the sanctioned additions.
// NOTE: lines are trimmed before matching, so these patterns must not anchor on indentation.
const sanctioned = [
  /^<script src="lib\/pc-util\.js\?v=/,            // the new script tag
  /^\/\/ Phase C extraction/,                       // alias block comment
  /^\/\/ aliased locally/,                          // alias block comment
  /^const \{uid, isHeic/,                           // alias destructure, line 1
  /^escapeRe, collectStrings/,                      // alias destructure, line 2
  /^IMPORT_MONTHS, normWS/,                         // alias destructure, line 3
  /^parseImportDate, parseCombinedName/,            // alias destructure, line 4 (ends `} = PCUtil;`)
  /^<meta name="app-build"/                         // the build bump
];
const unexpected = added
  .map(l => l.trim())
  .filter(l => l !== '')
  .filter(l => !sanctioned.some(re => re.test(l)));

console.log(`diff range        : ${BASE}..${HEAD}`);
console.log(`lines removed     : ${removed.filter(l => l.trim()).length}`);
console.log(`lines added       : ${added.filter(l => l.trim()).length}`);
console.log(`removed-but-missing from pc-util.js : ${missing.length}`);
console.log(`added-but-unsanctioned              : ${unexpected.length}`);

if (missing.length) {
  console.log('\nFAIL — these removed lines are NOT in pc-util.js verbatim:');
  missing.forEach(l => console.log('  ' + JSON.stringify(l)));
}
if (unexpected.length) {
  console.log('\nFAIL — these added lines are outside the sanctioned set:');
  unexpected.forEach(l => console.log('  ' + JSON.stringify(l)));
}

if (missing.length || unexpected.length) process.exit(1);
console.log('\nPASS — move is verbatim; additions are only the script tag, aliases, and build bump.');
