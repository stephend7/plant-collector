// Gate C P1-3, the strong form. Codex correctly rejected the v1 text checker's claim to
// prove a "behavior-preserving" move: comparing trimmed unordered lines cannot show that
// the extracted code DOES THE SAME THING, only that similar text exists somewhere.
//
// This test proves the thing that actually matters. It reconstructs the ORIGINAL
// implementations by pulling the exact lines Phase C deleted out of app/index.html at the
// pre-extraction commit, evaluates them in isolation, and then runs both the old and the
// new implementations over a shared input corpus — including real rows from Stephen's
// actual spreadsheets — asserting identical output.
//
// Intentional post-extraction changes are declared in INTENTIONAL_DIVERGENCE below. That
// list is the honest, reviewable surface: anything NOT on it must match the original
// exactly, and anything on it must ALSO be covered by its own correctness test elsewhere.
// A regression cannot hide here without someone explicitly adding it to that list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const path = require('node:path');

const REPO = path.join(__dirname, '../..');
const PRE_EXTRACTION = 'a48e6be';   // main, immediately before Phase C
const EXTRACTION = '753e0cf';       // the verbatim-move commit

// Inputs whose behavior deliberately changed after the extraction, keyed by function and
// then by the EXACT input string. Codex's Gate C round 2 (P1-1) rejected the earlier
// whole-function form of this list: exempting all of `parseImportDate` meant a regression
// in a perfectly good case (breaking `5/2020`) sailed through green, because the function
// was already excused wholesale. Per-input means every case NOT listed here must still
// match the pre-extraction implementation exactly.
//
// Each listed input must also be covered by its own correctness test in pc-util.test.js —
// this list only exempts an input from "identical to the original", never from testing.
const INTENTIONAL_DIVERGENCE = {
  parseImportDate: {
    '13/40/2020': 'Gate C P1-1: impossible M/D/Y must return null+warn per the approved spec table, not fall through to a fabricated year-only guess.',
    '2024-13-40': 'Gate C P1-1: the ISO branch had no range validation at all and accepted this as a confident, unwarned date.',
    '2/31/2024':  'Gate C P1-1: day-vs-month range was unchecked (Feb has no 31st).',
    '2024-02-31': 'Gate C P1-1: same impossible calendar date via the ISO branch.',
    '2023-02-29': 'Gate C P1-1: Feb 29 in a non-leap year is not a real date.',
    '13/2020':    'Gate C P2-1: impossible month in the M/YYYY shape fell through to a fabricated year-only guess.',
    '0/2020':     'Gate C P2-1: month 0 is impossible; same M/YYYY fallthrough as 13/2020.',
  }
};

function git(...args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Rebuild the pre-extraction implementations from the lines Phase C removed.
function loadOriginalImplementations() {
  const diff = git('diff', '--no-color', '-U0', `${PRE_EXTRACTION}..${EXTRACTION}`, '--', 'app/index.html');
  const removed = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('---')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1));
  }
  // Drop the app-build marker line; it is a version bump, not moved code.
  const source = removed.filter(l => !/^<meta name="app-build"/.test(l)).join('\n');

  const context = vm.createContext({ crypto: globalThis.crypto });
  // The removed text is a set of bare declarations; wrap it so we can capture them all.
  vm.runInContext(`
    var __exported = {};
    (function () {
      ${source}
      __exported = {
        uid, isHeic, thumbOf, todayLocal, sameSet,
        escapeRe, collectStrings, extractEpithet, matchGenusSpeciesFromString, matchGenusSpecies, exifDateOf,
        IMPORT_MONTHS, normWS, normQuotes, normKey, pad2, expandYear,
        parseImportDate, parseCombinedName, scrapePrice, cleanPrice, guessImportMap, guessStatus, LIFECYCLE_STATUSES
      };
    })();
  `, context, { filename: 'reconstructed-original.js' });
  return context.__exported;
}

const original = loadOriginalImplementations();
const current = require('../../app/lib/pc-util.js');

const GENERA = ['Nepenthes', 'Pinguicula', 'Drosera', 'Sarracenia', 'Utricularia', 'Heliamphora'];

// Shapes drawn from real private spreadsheets read as local test fixtures (per
// AGENTS.md — readable locally, never committed) — the corpus below reproduces the same
// PATTERNS (leading-x hybrid, quoted cultivar + trailing accession code, corrupt/
// unbalanced quoting, curly-brace wild-locality) using entirely invented names, not the
// real ones. See decisions.md 2026-08-04 for why this corpus was rewritten.
const NAME_CORPUS = [
  "Nepenthes veitchii 'Candy', BE-3390", 'N. veitchii', 'pinguicula moranensis', 'Drosera',
  'Nepenthes fixturea x samplensis', 'Sarracenia demoflora TX P99',
  'Sarracenia demoflora "Faux Cultivar"', 'Sarracenia demoflora var. exampla "sample #5 test tag"',
  'Nepenthes veitchii ’Candy’', 'x "Placeholder"', 'x \'Fixturename\'', '"Testflaw\'',
  'Pinguicula {Exampleville, Testregion, Nowhere}', 'P. agnata × gigantea #2', '', '   ',
  'Utricularia longifolia', 'Heliamphora ionasi $85', 'Drosera capensis red form'
];
const DATE_CORPUS = [
  '2024-05-17', '8/9/21', 'August 2020', 'Aug. 2020', '2019', '', '   ',
  '13/40/2020', '2024-13-40', '2/31/2024', '2024-02-31', '2024-02-29', '2023-02-29',
  '1/2/2020', '12/31/99', '3-4-2021', '2020', 'no date given', 'circa 2015', '5/2020',
  '13/2020', '0/2020', '1/2020', '12/2020'   // M/YYYY: invalid months + both valid boundaries
];
const STATUS_CORPUS = [
  'Died winter 2023', 'SOLD', 'traded to Dave', 'gift', 'still have it', '', '???',
  'alive', 'ROTTED', 'gave away', 'in collection', 'unknown'
];
const HEADER_CORPUS = [
  ['Acc #', 'Plant Name', 'Date Acq.', 'Type (seed/plant)', 'Source:', 'Alt code:', 'Comments', 'Site'],
  ['Plant Name', 'Source', 'Date Obtained', 'Notes', 'Description'],
  ['Genus', 'Species', 'Vendor', 'Price', 'Descriptor'],
  ['Genus Species/Cultivar/Variety', 'Source', 'Notes'],
  []
];

function compare(t, fnName, inputs, invoke) {
  const declared = INTENTIONAL_DIVERGENCE[fnName] || {};
  const undeclaredDiffs = [];   // changed but NOT declared → regression
  const declaredThatDiffered = new Set();

  for (const input of inputs) {
    const a = JSON.stringify(invoke(original[fnName], input));
    const b = JSON.stringify(invoke(current[fnName], input));
    const key = typeof input === 'string' ? input : null;
    const isDeclared = key !== null && Object.prototype.hasOwnProperty.call(declared, key);
    if (a !== b) {
      if (isDeclared) declaredThatDiffered.add(key);
      else undeclaredDiffs.push({ input, original: a, current: b });
    }
  }

  // 1. Anything that changed without being declared is a regression, even in a function
  //    that has other declared changes. (Codex Gate C round 2, P1-1.)
  assert.deepEqual(undeclaredDiffs, [],
    `${fnName} diverged from the pre-extraction implementation on input(s) not listed in ` +
    `INTENTIONAL_DIVERGENCE. If deliberate, add the exact input with a reason AND a dedicated ` +
    `correctness test; otherwise this is a regression.`);

  // 2. A declared input that no longer differs means the list is stale (or the fix was
  //    reverted) — fail loudly rather than let the exemption quietly outlive its reason.
  for (const key of Object.keys(declared)) {
    if (!inputs.includes(key)) continue;   // not exercised by this corpus; checked where it is
    assert.ok(declaredThatDiffered.has(key),
      `${fnName}(${JSON.stringify(key)}) is declared in INTENTIONAL_DIVERGENCE but now matches ` +
      `the original — either the fix was reverted, or the entry is stale and should be removed.\n` +
      `Reason on file: ${declared[key]}`);
  }
}

test('extraction preserved behavior — pure string/utility helpers', async (t) => {
  compare(t, 'normWS', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'normQuotes', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'normKey', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'escapeRe', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'thumbOf', ['a/b.jpg', 'x/y/z.jpg', 'no-extension', 'a.jpeg'], (f, x) => f(x));
  compare(t, 'pad2', [1, 9, 10, 99, 0], (f, x) => f(x));
  compare(t, 'expandYear', [0, 49, 50, 99, 100, 1999, 2024], (f, x) => f(x));
  compare(t, 'scrapePrice', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'cleanPrice', ['$14.50', '14', 'free', '', '$1,200.00', 'abc'], (f, x) => f(x));
});

test('extraction preserved behavior — import parsers', async (t) => {
  compare(t, 'parseCombinedName', NAME_CORPUS, (f, x) => f(x));
  compare(t, 'guessStatus', STATUS_CORPUS, (f, x) => f(x));
  compare(t, 'guessImportMap', HEADER_CORPUS, (f, x) => f(x));
  // Declared-divergent: asserts the fix actually changed behavior (see the list above).
  compare(t, 'parseImportDate', DATE_CORPUS, (f, x) => f(x));
});

test('extraction preserved behavior — botanical name matching', async (t) => {
  compare(t, 'matchGenusSpeciesFromString', NAME_CORPUS, (f, x) => f(x, GENERA));
  compare(t, 'matchGenusSpecies', NAME_CORPUS, (f, x) => f(x, GENERA));
  compare(t, 'extractEpithet', NAME_CORPUS, (f, x) => f(x, GENERA));
});

test('extraction preserved behavior — misc helpers', async (t) => {
  compare(t, 'isHeic', [
    { name: 'a.heic' }, { name: 'a.jpg' }, { type: 'image/heif' }, { type: '', name: '' }
  ], (f, x) => f(x));
  compare(t, 'exifDateOf', [
    { DateTimeOriginal: '2024-05-17T10:00:00Z' }, { CreateDate: new Date(Date.UTC(2020, 0, 2)) },
    {}, null, { ModifyDate: 'not a date' }
  ], (f, x) => f(x));
  compare(t, 'sameSet', [[[1, 2, 3], ['3', '1', '2']], [[1, 2], [1, 2, 3]], [[], []]],
    (f, pair) => f(pair[0], pair[1]));
  compare(t, 'collectStrings', [
    { a: 'x', b: { c: 'y' } }, ['p', 'q'], null, { deep: { deep: { deep: { deep: { deep: 'too far' } } } } }
  ], (f, x) => f(x));
  // Zero-argument helpers. Both were missed by the first draft of this corpus — a
  // mutation that commented out todayLocal's declaration and substituted a stub passed
  // the whole suite, because nothing ever called it. Caught while mutation-testing this
  // very file; the lesson is that "compare every export" beats "compare the interesting
  // ones", so both no-arg helpers are now exercised explicitly.
  compare(t, 'todayLocal', [null], (f) => f());
  // uid() is deliberately non-deterministic, so compare its SHAPE rather than its value:
  // a stubbed or broken implementation still has to produce a v4-looking UUID.
  compare(t, 'uid', [null], (f) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(f()));
});

test('constants survived the move unchanged', () => {
  // Compared via JSON rather than deepEqual: `original` is built inside a vm context, so
  // its objects come from a different realm with a different Object.prototype. deepEqual
  // is reference-equality-sensitive about prototypes and fails on identical values.
  assert.equal(JSON.stringify(current.LIFECYCLE_STATUSES), JSON.stringify(original.LIFECYCLE_STATUSES));
  assert.equal(JSON.stringify(current.IMPORT_MONTHS), JSON.stringify(original.IMPORT_MONTHS));
});
