import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeSpec, decodeSpec } from '../src/engine/config';
import { generate } from '../src/engine/generate';

test('config: round-trips a spec', () => {
  for (const s of ['Restov', 'House Aldori', 'seed-7', 'Pitax']) {
    const spec = generate(s);
    const enc = encodeSpec(spec);
    assert.ok(enc.startsWith('HF1:'));
    assert.deepEqual(decodeSpec(enc), spec);
  }
});

test('config: accepts raw spec JSON too', () => {
  const spec = generate('Mivon');
  assert.deepEqual(decodeSpec(JSON.stringify(spec)), spec);
});

test('config: rejects garbage', () => {
  assert.equal(decodeSpec('not a config'), null);
  assert.equal(decodeSpec('HF1:%%%'), null);
  assert.equal(decodeSpec('{"nope":true}'), null);
  assert.equal(decodeSpec(''), null);
});
