// Issue #6: free offsets for charges / imported ordinaries, and custom colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSvg } from '../src/engine/render';
import { toBlazon } from '../src/engine/blazon';
import { decodeSpec, encodeSpec } from '../src/engine/config';
import {
  hexOf, labelOf, tinctureClass, contrasts, isCustomColour, makeCustomColour, parseHexColour,
} from '../src/engine/tinctures';
import { registerOrdinaryAsset, clearOrdinaryAssets } from '../src/engine/assets';
import type { Spec, ChargeGroup, Tincture } from '../src/engine/types';

const mullet = (over: Partial<ChargeGroup> = {}): ChargeGroup => ({
  charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one', position: 'center', ...over,
});
const arms = (over: Partial<Spec> = {}): Spec => ({
  shield: 'heater',
  field: { mode: 'plain', tinctures: ['azure'] },
  charges: [],
  ...over,
});

/** The translate of every charge instance's placement group. */
function chargeTranslates(svg: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /<g transform="(?:rotate\([^)]*\) )?translate\(([-\d.]+),([-\d.]+)\) scale/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

// --- charge offsets -----------------------------------------------------------

test('charge offset: zero offset renders exactly as before', () => {
  const plain = renderSvg(arms({ charges: [mullet()] }), { uid: 'a' }).replace(/hw-clip-a-\d+/g, 'X');
  const zero = renderSvg(arms({ charges: [mullet({ offsetX: 0, offsetY: 0 })] }), { uid: 'a' }).replace(/hw-clip-a-\d+/g, 'X');
  assert.equal(zero, plain);
});

test('charge offset: moves the group by % of the 160x198 field box', () => {
  const [base] = chargeTranslates(renderSvg(arms({ charges: [mullet()] })));
  const [moved] = chargeTranslates(renderSvg(arms({ charges: [mullet({ offsetX: 10, offsetY: -20 })] })));
  assert.ok(Math.abs(moved[0] - base[0] - 16) < 0.01, `dx ${moved[0] - base[0]}`);
  assert.ok(Math.abs(moved[1] - base[1] + 39.6) < 0.01, `dy ${moved[1] - base[1]}`);
});

test('charge offset: every instance of a group moves together', () => {
  const g = { count: 3, arrangement: 'two-and-one' as const };
  const base = chargeTranslates(renderSvg(arms({ charges: [mullet(g)] })));
  const moved = chargeTranslates(renderSvg(arms({ charges: [mullet({ ...g, offsetX: 5 })] })));
  assert.equal(moved.length, 3);
  moved.forEach((p, i) => assert.ok(Math.abs(p[0] - base[i][0] - 8) < 0.01));
});

test('charge offset: rotation pivots about the moved centre', () => {
  const svg = renderSvg(arms({ charges: [mullet({ rotate: 30, offsetX: 10 })] }));
  // Centre anchor is (100, 118); +10% of 160 = +16.
  assert.match(svg, /rotate\(30 116 118\)/);
});

test('charge offset: counterchange mask follows the moved charge', () => {
  const spec = arms({
    field: { mode: 'division', division: 'per-pale', tinctures: ['vert', 'argent'] },
    charges: [mullet({ counterchanged: true, offsetX: 10 })],
  });
  const svg = renderSvg(spec);
  const [moved] = chargeTranslates(svg);
  const [base] = chargeTranslates(renderSvg({ ...spec, charges: [mullet({ counterchanged: true })] }));
  assert.ok(Math.abs(moved[0] - base[0] - 16) < 0.01);
});

test('charge offset: flags use the flag frame as the unit', () => {
  const flag = (o: number) => renderSvg(arms({ format: 'flag', flag: 'flag', charges: [mullet({ offsetX: o })] }));
  const [base] = chargeTranslates(flag(0));
  const [moved] = chargeTranslates(flag(10));
  const w = Number(/viewBox="0 0 ([\d.]+)/.exec(flag(0))![1]);
  assert.ok(Math.abs(moved[0] - base[0] - w * 0.1) < 0.01);
});

test('charge offset: survives the HF1 share-code round trip', () => {
  const spec = arms({ charges: [mullet({ offsetX: -12, offsetY: 7 })] });
  const back = decodeSpec(encodeSpec(spec))!;
  assert.equal(back.charges[0].offsetX, -12);
  assert.equal(back.charges[0].offsetY, 7);
});

// --- imported ordinary vertical offset -------------------------------------------

test('imported ordinary: offsetY shifts it vertically by % of field height', () => {
  registerOrdinaryAsset({
    id: 'test-bar', singular: 'bar', plural: 'bars', article: 'a',
    render: (f) => `<rect x="0" y="40" width="100" height="20" fill="${f}"/>`,
  });
  try {
    const svg = renderSvg(arms({ ordinary: { type: 'test-bar', tincture: 'or', offsetX: 10, offsetY: 10 } }));
    assert.match(svg, /translate\(16 19\.8\)/);
  } finally {
    clearOrdinaryAssets();
  }
});

// --- custom colours -------------------------------------------------------------

test('custom colour: recognised, normalised and rendered as its own hex', () => {
  assert.equal(isCustomColour('#3A7BD5'), true);
  assert.equal(isCustomColour('#3a7'), false);
  assert.equal(isCustomColour('azure'), false);
  const t = makeCustomColour('#3A7BD5');
  assert.equal(t, '#3a7bd5');
  assert.equal(hexOf(t), '#3a7bd5');
  const svg = renderSvg(arms({ field: { mode: 'plain', tinctures: [t] }, charges: [mullet({ tincture: '#ffcc00' as Tincture })] }));
  assert.match(svg, /fill="#3a7bd5"/);
  assert.match(svg, /fill="#ffcc00"/);
});

test('custom colour: works as both tinctures of a division', () => {
  const svg = renderSvg(arms({ field: { mode: 'division', division: 'per-fess', tinctures: ['#112233' as Tincture, '#ddeeff' as Tincture] } }));
  assert.match(svg, /#112233/);
  assert.match(svg, /#ddeeff/);
});

test('custom colour: blazoned by its hex', () => {
  const spec = arms({ field: { mode: 'plain', tinctures: ['#3a7bd5' as Tincture] }, charges: [mullet()] });
  assert.equal(labelOf('#3a7bd5' as Tincture), '#3A7BD5');
  assert.equal(toBlazon(spec), '#3A7BD5, a mullet Or');
});

test('custom colour: light reads as metal, dark as colour, for the rule of tincture', () => {
  assert.equal(tinctureClass('#fff4c0' as Tincture), 'metal');
  assert.equal(tinctureClass('#203060' as Tincture), 'colour');
  // The built-in hexes classify the same way their tinctures do.
  for (const t of ['or', 'argent'] as Tincture[]) assert.equal(tinctureClass(hexOf(t) as Tincture), 'metal');
  for (const t of ['gules', 'azure', 'sable', 'vert', 'purpure'] as Tincture[]) {
    assert.equal(tinctureClass(hexOf(t) as Tincture), 'colour');
  }
  assert.equal(contrasts('#203060' as Tincture, 'or'), true);
  assert.equal(contrasts('#203060' as Tincture, 'azure'), false);
});

test('custom colour: hex box accepts #, bare and 3-digit forms, rejects the rest', () => {
  assert.equal(parseHexColour('#3A7BD5'), '#3a7bd5');
  assert.equal(parseHexColour('  3a7bd5 '), '#3a7bd5');
  assert.equal(parseHexColour('#37d'), '#3377dd');
  assert.equal(parseHexColour('f0a'), '#ff00aa');
  for (const bad of ['', '#', '#3a7bd', '#3a7bd5ff', 'azure', '#ggg']) {
    assert.equal(parseHexColour(bad), null, bad);
  }
});
