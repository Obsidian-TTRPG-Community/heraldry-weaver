import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateName,
  PLACE_PREFIX,
  PLACE_SUFFIX,
  HOUSE_ONSET,
  HOUSE_END,
} from '../src/engine/names';

// A spread of seeds covering the kinds of strings the plugin actually feeds the
// generator: rolled tokens, note titles, frontmatter seeds, numbers, spaces.
const SEEDS = [
  'Caldwyn', 'riverbend', '42', 'Oakmoor Keep', 'a', 'b', 'c', 'dragon-hold',
  'House of the Setting Sun', 'x9f3', 'Tuskwater', 'Restov', 'Pitax',
  'seed-001', 'aurora', 'Bramblewood', '7', 'greenbelt', 'hexmap-tile-1',
  'Varnhold',
];

test('same seed always yields the same name', () => {
  for (const s of SEEDS) {
    assert.equal(generateName(s), generateName(s));
  }
  // And stable across many repeats of one seed.
  const first = generateName('stability-check');
  for (let i = 0; i < 50; i++) assert.equal(generateName('stability-check'), first);
});

test('every name is well-formed (trimmed, capitalised, letters only)', () => {
  for (let i = 0; i < 4000; i++) {
    const n = generateName('fmt-' + i);
    assert.ok(n.length > 0, 'empty name');
    assert.equal(n, n.trim(), `untrimmed: "${n}"`);
    assert.ok(!/\s{2,}/.test(n), `double space: "${n}"`);
    // Place: a single capitalised word. House: "House " + capitalised word.
    assert.match(n, /^(House [A-Z][a-z]+|[A-Z][a-z]+)$/, `bad shape: "${n}"`);
  }
});

test('place names decompose into a known prefix + suffix', () => {
  for (let i = 0; i < 4000; i++) {
    const n = generateName('place-' + i);
    if (n.startsWith('House ')) continue;
    const prefix = PLACE_PREFIX.find((p) => n.startsWith(p));
    assert.ok(prefix, `no known prefix in "${n}"`);
    const rest = n.slice(prefix!.length);
    assert.ok(PLACE_SUFFIX.includes(rest), `unknown suffix "${rest}" in "${n}"`);
  }
});

test('house names decompose into a known onset ... end', () => {
  for (let i = 0; i < 4000; i++) {
    const n = generateName('house-' + i);
    if (!n.startsWith('House ')) continue;
    const surname = n.slice('House '.length);
    const onset = HOUSE_ONSET.find((o) => surname.startsWith(o));
    assert.ok(onset, `no known onset in "${surname}"`);
    const end = HOUSE_END.find((e) => surname.endsWith(e));
    assert.ok(end, `no known ending in "${surname}"`);
  }
});

test('roughly 40% of names are houses', () => {
  let house = 0;
  const total = 5000;
  for (let i = 0; i < total; i++) {
    if (generateName('ratio-' + i).startsWith('House ')) house++;
  }
  const frac = house / total;
  assert.ok(frac > 0.33 && frac < 0.47, `house fraction ${frac.toFixed(3)} off target 0.40`);
});

test('the generator produces plenty of variety', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateName('var-' + i));
  // ~half are unique in practice; 300 is a comfortable floor.
  assert.ok(seen.size > 300, `only ${seen.size} distinct names from 1000 seeds`);
});

test('distinct seeds usually give distinct names', () => {
  // Not a hash guarantee, but adjacent seeds should not collapse to one name.
  const a = generateName('alpha');
  const b = generateName('beta');
  const c = generateName('gamma');
  assert.ok(new Set([a, b, c]).size >= 2);
});
