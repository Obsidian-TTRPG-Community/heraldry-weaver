import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerCustomFur, clearCustomFurs, makeCustomFur, parseCustomFur,
  isCustomFur, hexOf, labelOf,
} from '../src/engine/tinctures';
import { furFromSvg } from '../src/engine/assets';
import { renderSvg, furSwatchSvg } from '../src/engine/render';
import { toBlazon } from '../src/engine/blazon';

const FUR_SVG = '<svg viewBox="0 0 50 60"><path d="M5 5 L45 5 L45 55 L5 55 Z" fill="#214ab3"/></svg>';

test('furFromSvg builds a custom fur with palette and dimensions', () => {
  const f = furFromSvg('fleur', FUR_SVG, { label: 'Fleur', category: 'Pack' });
  assert.equal(f.w, 50);
  assert.equal(f.h, 60);
  assert.deepEqual(f.palette, ['#214ab3']);
  assert.equal(f.label, 'Fleur');
});

test('custom fur id encode/decode round-trips, with optional recolour target', () => {
  clearCustomFurs();
  registerCustomFur(furFromSvg('fleur', FUR_SVG, { label: 'Fleur' }));
  assert.ok(isCustomFur(makeCustomFur('fleur')));
  assert.equal(parseCustomFur(makeCustomFur('fleur'))!.target, undefined);
  assert.equal(parseCustomFur(makeCustomFur('fleur', 'gules'))!.target, 'gules');
  assert.equal(parseCustomFur('cfur:missing' as any), null);
  clearCustomFurs();
});

test('render: plain field of a custom fur cover-fills via a pattern', () => {
  clearCustomFurs();
  registerCustomFur(furFromSvg('fleur', FUR_SVG, { label: 'Fleur' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'plain', tinctures: [makeCustomFur('fleur')] }, charges: [] } as any, { uid: 't' });
  assert.match(svg, /<pattern id="hw-cfur-/);
  assert.match(svg, /url\(#hw-cfur-/);
  assert.match(svg, /#214ab3/); // original colour preserved
  clearCustomFurs();
});

test('render + blazon: recoloured custom fur uses the target colour and label', () => {
  clearCustomFurs();
  registerCustomFur(furFromSvg('fleur', FUR_SVG, { label: 'Fleur-de-lis' }));
  const t = makeCustomFur('fleur', 'gules');
  assert.equal(labelOf(t), 'Fleur-de-lis Gules');
  const spec = { shield: 'heater', field: { mode: 'plain', tinctures: [t] }, charges: [] };
  const svg = renderSvg(spec as any, { uid: 't' });
  assert.ok(!svg.includes('#214ab3'), 'original colour replaced');
  assert.ok(svg.includes(hexOf('gules')), 'target colour applied');
  assert.match(toBlazon(spec as any), /Fleur-de-lis Gules/);
  clearCustomFurs();
});

test('custom fur renders on one side of a division', () => {
  clearCustomFurs();
  registerCustomFur(furFromSvg('fleur', FUR_SVG, { label: 'Fleur' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'division', tinctures: [makeCustomFur('fleur'), 'or'], division: 'per-pale' }, charges: [] } as any, { uid: 't' });
  assert.match(svg, /url\(#hw-cfur-/);
  clearCustomFurs();
});

test('furSwatchSvg renders a sliced cover swatch for a custom fur', () => {
  clearCustomFurs();
  registerCustomFur(furFromSvg('fleur', FUR_SVG, { label: 'Fleur' }));
  const sw = furSwatchSvg(makeCustomFur('fleur'));
  assert.match(sw, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(sw, /#214ab3/);
  clearCustomFurs();
});
