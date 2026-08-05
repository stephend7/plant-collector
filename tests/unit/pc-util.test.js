// Phase C starter unit tests (docs/stabilization-plan.md). The contract these functions
// must preserve through the extraction — written against the moved lib/pc-util.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const PCUtil = require('../../app/lib/pc-util.js');

const GENUS_LIST = ['Nepenthes', 'Pinguicula', 'Drosera', 'Sarracenia'];

test('parseCombinedName', async (t) => {
  await t.test('genus + cultivar species + accession code', () => {
    const r = PCUtil.parseCombinedName("Nepenthes veitchii 'Candy', BE-3390");
    assert.equal(r.genus, 'Nepenthes');
    assert.equal(r.species, "veitchii 'Candy'");
    assert.equal(r.accession, 'BE-3390');
    assert.equal(r.warn, false);
  });

  await t.test('abbreviated genus is left for the user, flagged', () => {
    const r = PCUtil.parseCombinedName('N. veitchii');
    assert.equal(r.warn, true);
  });

  await t.test('genus is capitalized', () => {
    const r = PCUtil.parseCombinedName('pinguicula moranensis');
    assert.equal(r.genus, 'Pinguicula');
  });

  await t.test('single token → species-only, warn', () => {
    const r = PCUtil.parseCombinedName('Drosera');
    assert.equal(r.genus, '');
    assert.equal(r.species, 'Drosera');
    assert.equal(r.warn, true);
  });

  await t.test('smart quotes normalized to straight', () => {
    const r = PCUtil.parseCombinedName('Nepenthes veitchii ’Candy’');
    assert.equal(r.species, "veitchii 'Candy'");
  });
});

test('parseImportDate', async (t) => {
  await t.test('ISO date → day precision, no warn', () => {
    const r = PCUtil.parseImportDate('2024-05-17');
    assert.equal(r.iso, '2024-05-17');
    assert.equal(r.precision, 'day');
    assert.equal(r.warn, false);
  });

  await t.test('M/D/Y ambiguous → day precision, warn', () => {
    const r = PCUtil.parseImportDate('8/9/21');
    assert.equal(r.iso, '2021-08-09');
    assert.equal(r.precision, 'day');
    assert.equal(r.warn, true);
  });

  await t.test('"August 2020" → month precision, warn', () => {
    const r = PCUtil.parseImportDate('August 2020');
    assert.equal(r.iso, '2020-08-01');
    assert.equal(r.precision, 'month');
    assert.equal(r.warn, true);
  });

  await t.test('"Aug. 2020" → same as full month name', () => {
    const r = PCUtil.parseImportDate('Aug. 2020');
    assert.equal(r.iso, '2020-08-01');
    assert.equal(r.precision, 'month');
    assert.equal(r.warn, true);
  });

  await t.test('year only → year precision, warn', () => {
    const r = PCUtil.parseImportDate('2019');
    assert.equal(r.iso, '2019-01-01');
    assert.equal(r.precision, 'year');
    assert.equal(r.warn, true);
  });

  // KNOWN PRE-EXISTING GAP (found by this extraction, not introduced by it — see
  // decisions.md "Phase C — two pre-existing parsing gaps found by new test coverage").
  // An invalid M/D/Y (month 13, day 40) fails the M/D/Y branch's range check and falls
  // through to the bare "any 19xx/20xx number" year-only regex, which still finds "2020"
  // in the string. Not dangerous (warn stays true, so the import preview still flags it
  // for the user), but not the "give up entirely" behavior the original design intended.
  await t.test('invalid M/D/Y falls through to a year-only guess, still warns', () => {
    const r = PCUtil.parseImportDate('13/40/2020');
    assert.equal(r.iso, '2020-01-01');
    assert.equal(r.precision, 'year');
    assert.equal(r.warn, true);
  });

  await t.test('empty → null, no warn', () => {
    const r = PCUtil.parseImportDate('');
    assert.equal(r.iso, null);
    assert.equal(r.warn, false);
  });
});

test('guessStatus', async (t) => {
  await t.test('"Died winter 2023" → dead', () => {
    assert.equal(PCUtil.guessStatus('Died winter 2023'), 'dead');
  });
  await t.test('"SOLD" → sold', () => {
    assert.equal(PCUtil.guessStatus('SOLD'), 'sold');
  });
  await t.test('"traded to Dave" → traded', () => {
    assert.equal(PCUtil.guessStatus('traded to Dave'), 'traded');
  });
  await t.test('"gift" → given_away', () => {
    assert.equal(PCUtil.guessStatus('gift'), 'given_away');
  });
  await t.test('"still have it" → in_collection', () => {
    assert.equal(PCUtil.guessStatus('still have it'), 'in_collection');
  });
  await t.test('empty → in_collection', () => {
    assert.equal(PCUtil.guessStatus(''), 'in_collection');
  });
  await t.test('"???" → null (unknown, user decides)', () => {
    assert.equal(PCUtil.guessStatus('???'), null);
  });
});

test('guessImportMap', async (t) => {
  await t.test('JF-sheet-style headers map correctly, second notes-shaped column not dropped', () => {
    const map = PCUtil.guessImportMap(['Plant Name', 'Source', 'Date Obtained', 'Notes', 'Description']);
    assert.equal(map.combinedName, '0');
    assert.equal(map.vendor, '1');
    assert.equal(map.acquisitionDate, '2');
    assert.equal(map.notes, '3');
    assert.equal(map.notes2, '4');
  });

  await t.test('"Descriptor" maps to formDescriptor, not notes', () => {
    const map = PCUtil.guessImportMap(['Descriptor']);
    assert.equal(map.formDescriptor, '0');
    assert.equal(map.notes, '');
  });
});

test('matchGenusSpeciesFromString', async (t) => {
  await t.test('plain genus + species matches', () => {
    const r = PCUtil.matchGenusSpeciesFromString('Pinguicula moranensis', GENUS_LIST);
    assert.equal(r.genus, 'Pinguicula');
    assert.equal(r.species, 'moranensis');
  });

  // KNOWN PRE-EXISTING GAP (found by this extraction, not introduced by it — see
  // decisions.md "Phase C — two pre-existing parsing gaps found by new test coverage").
  // The hybrid-boundary check tests a SPACE-PADDED copy of the string (" "+after), but
  // the normalizing .replace() runs on the unpadded `after` — so when the hybrid marker
  // is the very first character (genus immediately followed by "x Name", no space before
  // the x within `after` itself), detection succeeds but the 'x'→'×' normalization never
  // fires. Real-world relevant: this is the exact leading-x pattern the sample Pinguicula
  // sheet uses (see memory: sample-pinguicula-sheet.md).
  await t.test('leading-x hybrid form (from the Ping sheet) — detected but not normalized', () => {
    const r = PCUtil.matchGenusSpeciesFromString('Pinguicula x Tina', GENUS_LIST);
    assert.equal(r.genus, 'Pinguicula');
    assert.equal(r.species, 'x Tina'); // NOT '× Tina' — the gap described above
  });

  await t.test('hybrid marker WITH a preceding word normalizes correctly', () => {
    const r = PCUtil.matchGenusSpeciesFromString('Pinguicula moranensis x Tina', GENUS_LIST);
    assert.equal(r.genus, 'Pinguicula');
    assert.match(r.species, /×/);
  });

  await t.test('genus-only string → genus hit, empty species', () => {
    const r = PCUtil.matchGenusSpeciesFromString('Nepenthes', GENUS_LIST);
    assert.equal(r.genus, 'Nepenthes');
    assert.equal(r.species, '');
  });
});

test('small utils', async (t) => {
  await t.test('sameSet: order-insensitive, string/number mix', () => {
    assert.equal(PCUtil.sameSet([1, 2, 3], ['3', '1', '2']), true);
    assert.equal(PCUtil.sameSet([1, 2], [1, 2, 3]), false);
  });

  await t.test('thumbOf appends _thumb before the extension', () => {
    assert.equal(PCUtil.thumbOf('a/b.jpg'), 'a/b_thumb.jpg');
  });

  await t.test('cleanPrice parses a currency string', () => {
    assert.equal(PCUtil.cleanPrice('$14.50'), 14.5);
  });

  await t.test('scrapePrice pulls a $ amount out of free text', () => {
    assert.equal(PCUtil.scrapePrice('Heli ionasi $85'), 85);
  });

  await t.test('expandYear: 2-digit pivot at 49/50', () => {
    assert.equal(PCUtil.expandYear(49), 2049);
    assert.equal(PCUtil.expandYear(50), 1950);
  });
});
