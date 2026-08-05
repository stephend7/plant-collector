// Gate C P1-2 fix: tests/unit/pc-util.test.js only ever loads the CommonJS branch of
// pc-util.js's dual-environment wrapper (`require()` always defines `module`, so the
// UMD-lite check `typeof module !== 'undefined'` always takes the Node path there).
// That left the actual browser branch — the one the deployed app runs — completely
// unprotected: renaming `root.PCUtil` or dropping an export from the returned object
// left all 36 Node-branch tests green while silently breaking every page load, or one
// specific feature, in the browser. Demonstrated live during Gate C review.
//
// This file evaluates the real file source in a vm context with no `module` global —
// matching what a classic <script> tag actually sees — so the browser branch has its
// own independent proof instead of inheriting the Node branch's passing tests for free.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../app/lib/pc-util.js'), 'utf8');

const EXPECTED_EXPORTS = [
  'uid', 'isHeic', 'thumbOf', 'todayLocal', 'sameSet',
  'escapeRe', 'collectStrings', 'extractEpithet', 'matchGenusSpeciesFromString', 'matchGenusSpecies', 'exifDateOf',
  'IMPORT_MONTHS', 'normWS', 'normQuotes', 'normKey', 'pad2', 'expandYear',
  'parseImportDate', 'parseCombinedName', 'scrapePrice', 'cleanPrice', 'guessImportMap', 'guessStatus', 'LIFECYCLE_STATUSES'
].sort();

function runInBrowserLikeContext() {
  // A fresh vm context has no `module` global by default — that absence is exactly the
  // discriminator pc-util.js's wrapper branches on to decide it's running in a browser.
  // `crypto` is passed in because uid() calls crypto.randomUUID(), which a real browser
  // provides on `window` — Node's vm sandbox does not, unless given it explicitly.
  const context = vm.createContext({ crypto: globalThis.crypto });
  vm.runInContext(SOURCE, context, { filename: 'app/lib/pc-util.js' });
  return context;
}

test('browser branch binds a PCUtil object on the global (simulated window)', () => {
  const context = runInBrowserLikeContext();
  assert.equal(typeof context.PCUtil, 'object');
  assert.notEqual(context.PCUtil, null);
});

test('browser branch exports exactly the expected 24 names', () => {
  const context = runInBrowserLikeContext();
  const actual = Object.keys(context.PCUtil).sort();
  assert.deepEqual(actual, EXPECTED_EXPORTS);
});

test('every exported name in the browser branch is defined and callable/usable', () => {
  const context = runInBrowserLikeContext();
  for (const key of EXPECTED_EXPORTS) {
    assert.notEqual(context.PCUtil[key], undefined, `${key} is undefined in the browser branch`);
  }
  // Spot-check a few real calls, not just presence — proves the closures (STOP/RANK,
  // used internally by extractEpithet) survived intact in this execution context too.
  assert.match(context.PCUtil.uid(), /^[0-9a-f-]{36}$/i);
  assert.equal(context.PCUtil.thumbOf('a/b.jpg'), 'a/b_thumb.jpg');
  assert.equal(context.PCUtil.isHeic({ name: 'photo.heic' }), true);
  // assert.deepEqual on an object literal built INSIDE the vm context would fail here —
  // each vm context gets its own realm with its own Object.prototype, so a strict deep
  // comparison against a plain-object literal from this file's realm never matches even
  // when every property value is identical. Compare fields individually instead.
  const match = context.PCUtil.matchGenusSpeciesFromString('Pinguicula moranensis', ['Pinguicula']);
  assert.equal(match.genus, 'Pinguicula');
  assert.equal(match.species, 'moranensis');
});
