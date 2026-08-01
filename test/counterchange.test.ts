import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSvg } from '../src/engine/render';
import { toBlazon } from '../src/engine/blazon';
import { counterchangeable } from '../src/engine/counterchange';
import { hexOf } from '../src/engine/tinctures';
import type { Spec, Field, ChargeGroup } from '../src/engine/types';

const perPale: Field = { mode: 'division', division: 'per-pale', tinctures: ['vert', 'argent'] };

const arms = (over: Partial<Spec> = {}): Spec => ({
  shield: 'heater',
  field: perPale,
  charges: [],
  ...over,
});

const mullet = (over: Partial<ChargeGroup> = {}): ChargeGroup => ({
  charge: 'mullet',
  tincture: 'or',
  count: 1,
  arrangement: 'one',
  ...over,
});

// --- eligibility --------------------------------------------------------------

test('counterchange: only fields with two distinct region tinctures qualify', () => {
  assert.equal(counterchangeable(perPale), true);
  assert.equal(
    counterchangeable({ mode: 'variation', variation: 'barry', tinctures: ['or', 'sable'] }),
    true,
  );
  assert.equal(counterchangeable({ mode: 'plain', tinctures: ['azure'] }), false);
  assert.equal(counterchangeable({ mode: 'image', image: 'x', tinctures: ['azure'] }), false);
  // A "division" of one tincture with itself has nothing to swap.
  assert.equal(
    counterchangeable({ mode: 'division', division: 'per-pale', tinctures: ['vert', 'vert'] }),
    false,
  );
});

// --- rendering ----------------------------------------------------------------

test('counterchange: charge is painted through a mask, not with its own tincture', () => {
  const svg = renderSvg(arms({ charges: [mullet({ counterchanged: true })] }), { uid: 'cc1' });
  const mask = svg.match(/<mask id="(hw-cc-[^"]+)"/);
  assert.ok(mask, 'no counterchange mask emitted');
  assert.ok(svg.includes(`mask="url(#${mask![1]})"`), 'mask never referenced');
  // The charge silhouette is white inside the mask; it must not be drawn in Or.
  assert.ok(svg.includes('<g fill="#fff" stroke="#fff">'), 'silhouette not flattened to white');
});

test('counterchange: the source is the field with its tinctures swapped', () => {
  const vert = hexOf('vert');
  const argent = hexOf('argent');
  const svg = renderSvg(arms({ charges: [mullet({ counterchanged: true })] }), { uid: 'cc2' });
  // Field proper: dexter (x=0) vert, sinister (x=100) argent.
  assert.ok(svg.includes(`<rect x="0" y="0" width="100" height="230" fill="${vert}"/>`));
  // Counterchange source: the same geometry with the pair reversed.
  assert.ok(
    svg.includes(`<rect x="0" y="0" width="100" height="230" fill="${argent}"/>`),
    'swapped dexter region missing',
  );
  assert.ok(
    svg.includes(`<rect x="100" y="0" width="100" height="230" fill="${vert}"/>`),
    'swapped sinister region missing',
  );
});

test('counterchange: mask placement matches the charge placement exactly', () => {
  const plain = renderSvg(arms({ charges: [mullet({ scale: 1.3, rotate: 20 })] }), { uid: 'cc3' });
  const cc = renderSvg(
    arms({ charges: [mullet({ scale: 1.3, rotate: 20, counterchanged: true })] }),
    { uid: 'cc4' },
  );
  const placement = /rotate\(20 100 118\) translate\([-\d.]+,[-\d.]+\) scale\([\d.]+\)/;
  const want = plain.match(placement);
  assert.ok(want, 'baseline placement not found');
  assert.ok(cc.includes(want![0]), 'counterchanged charge placed differently');
});

test('counterchange: every group gets its own mask id', () => {
  const svg = renderSvg(
    arms({
      charges: [
        mullet({ counterchanged: true, position: 'top' }),
        mullet({ charge: 'roundel', counterchanged: true, position: 'bottom' }),
      ],
    }),
    { uid: 'cc5' },
  );
  const ids = [...svg.matchAll(/<mask id="(hw-cc-[^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, 'mask ids collide between groups');
});

test('counterchange: an ordinary counterchanges the same way', () => {
  const svg = renderSvg(
    arms({ ordinary: { type: 'fess', tincture: 'or', counterchanged: true } }),
    { uid: 'cc6' },
  );
  assert.ok(/<mask id="hw-cc-[^"]*-o"/.test(svg), 'no ordinary counterchange mask');
  assert.ok(!svg.includes(`height="46" fill="${hexOf('or')}"`), 'ordinary still drawn in Or');
});

test('counterchange: furs stay aligned (source reuses the field pattern def)', () => {
  const svg = renderSvg(
    arms({
      field: { mode: 'division', division: 'per-pale', tinctures: ['ermine', 'gules'] },
      charges: [mullet({ counterchanged: true })],
    }),
    { uid: 'cc7' },
  );
  const patterns = [...svg.matchAll(/<pattern id="(hw-fur-[^"]+)"/g)].map((m) => m[1]);
  assert.equal(patterns.length, 1, 'ermine pattern duplicated instead of shared');
  // Referenced twice: once by the field, once by the swapped counterchange source.
  assert.equal(svg.split(`url(#${patterns[0]})`).length - 1, 2);
});

test('counterchange: flags scale the source with the frame', () => {
  const svg = renderSvg(
    arms({ format: 'flag', flag: 'banner', charges: [mullet({ counterchanged: true })] }),
    { uid: 'cc8' },
  );
  const scales = [...svg.matchAll(/<g transform="scale\(([\d.]+) ([\d.]+)\)">/g)];
  assert.ok(scales.length >= 2, 'counterchange source not scaled into the flag frame');
  assert.deepEqual(scales[0].slice(1), scales[1].slice(1), 'source and field scaled differently');
});

// --- graceful degradation -----------------------------------------------------

test('counterchange: ignored on a plain field, charge keeps its tincture', () => {
  const svg = renderSvg(
    arms({ field: { mode: 'plain', tinctures: ['azure'] }, charges: [mullet({ counterchanged: true })] }),
    { uid: 'cc9' },
  );
  assert.ok(!svg.includes('<mask'), 'mask emitted for an uncounterchangeable field');
  assert.ok(svg.includes(`fill="${hexOf('or')}"`), 'charge lost its fallback tincture');
});

// --- blazon -------------------------------------------------------------------

test('counterchange: blazon says "counterchanged" only when it applies', () => {
  assert.equal(
    toBlazon(arms({ charges: [mullet({ counterchanged: true })] })),
    'Per pale Vert and Argent, a mullet counterchanged',
  );
  assert.equal(
    toBlazon(arms({ charges: [mullet({ count: 3, arrangement: 'two-and-one', counterchanged: true })] })),
    'Per pale Vert and Argent, three mullets counterchanged',
  );
  assert.equal(
    toBlazon(arms({ ordinary: { type: 'fess', tincture: 'or', counterchanged: true } })),
    'Per pale Vert and Argent, a fess counterchanged',
  );
  // Plain field: the flag is inert, so the blazon must not claim otherwise.
  assert.equal(
    toBlazon(arms({ field: { mode: 'plain', tinctures: ['azure'] }, charges: [mullet({ counterchanged: true })] })),
    'Azure, a mullet Or',
  );
});

test('counterchange: overrides keepColour for imported art', () => {
  const svg = renderSvg(
    arms({ charges: [mullet({ counterchanged: true, keepColour: true })] }),
    { uid: 'cc10' },
  );
  assert.ok(/<mask id="hw-cc-/.test(svg), 'keepColour suppressed the counterchange');
  assert.equal(
    toBlazon(arms({ charges: [mullet({ counterchanged: true, keepColour: true })] })),
    'Per pale Vert and Argent, a mullet counterchanged',
  );
});
