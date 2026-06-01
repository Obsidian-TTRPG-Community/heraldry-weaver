import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  viewBoxOf, fitTransform,
  shieldFromSvg, registerShieldAsset, clearShieldAssets, shieldAssetGroups,
  ordinaryFromSvg, registerOrdinaryAsset, clearOrdinaryAssets, isImportedOrdinary,
  fieldFromSvg, registerFieldAsset, clearFieldAssets,
  variationFromSvg, registerVariationAsset, clearVariationAssets,
  clearAllAssets,
} from '../src/engine/assets';
import { renderSvg } from '../src/engine/index';
import { toBlazon } from '../src/engine/blazon';

const SHIELD_SVG = '<svg viewBox="0 0 100 120"><path d="M10 10 L90 10 L90 80 L50 110 L10 80 Z" fill="#888"/></svg>';
const COLOR_SVG = '<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="#cc0000"/></svg>';
const POLY_SVG = '<svg viewBox="0 0 50 50"><polygon points="0,0 50,0 25,50"/></svg>';

test('viewBoxOf parses origin and size, falls back sensibly', () => {
  assert.deepEqual(viewBoxOf('<svg viewBox="5 6 70 80">'), { x: 5, y: 6, w: 70, h: 80 });
  assert.deepEqual(viewBoxOf('<svg>'), { x: 0, y: 0, w: 100, h: 100 });
});

test('fitTransform contain centres and scales to the smaller axis', () => {
  const t = fitTransform({ x: 0, y: 0, w: 100, h: 100 }, { x: 20, y: 16, w: 160, h: 198 }, 'contain');
  assert.match(t, /scale\(1\.6\)/); // min(160/100,198/100)=1.6
  assert.match(t, /translate\(20 35\)/); // y centred: 16 + (198-160)/2
});

test('shieldFromSvg extracts combined geometry; polygons convert to paths', () => {
  const s = shieldFromSvg('s1', SHIELD_SVG, { label: 'Spade' });
  assert.ok(s);
  assert.match(s!.d, /M10 10 L90 10/);
  assert.equal(s!.w, 100);
  const p = shieldFromSvg('s2', POLY_SVG);
  assert.ok(p && /M0,0 L50,0 L25,50 Z/.test(p.d));
  assert.equal(shieldFromSvg('s3', '<svg viewBox="0 0 10 10"><circle r="3"/></svg>'), null); // no path/polygon
});

test('render: imported shield drives clip + border with a fit transform', () => {
  clearShieldAssets();
  registerShieldAsset(shieldFromSvg('crest-shield', SHIELD_SVG, { label: 'Crest', category: 'Custom' })!);
  const svg = renderSvg({ shield: 'crest-shield', field: { mode: 'plain', tinctures: ['azure'] }, charges: [] }, { uid: 't' });
  assert.match(svg, /clipPath/);
  assert.match(svg, /M10 10 L90 10/); // outline used
  assert.match(svg, /transform="translate/); // fitted, not raw
  assert.deepEqual(shieldAssetGroups().map((g) => g.label), ['Custom']);
  clearShieldAssets();
});

test('render: imported ordinary draws recoloured at field scale; blazons by label', () => {
  clearOrdinaryAssets();
  registerOrdinaryAsset(ordinaryFromSvg('band', COLOR_SVG, { recolor: true, label: 'band' }));
  assert.ok(isImportedOrdinary('band'));
  const spec = { shield: 'heater', field: { mode: 'plain', tinctures: ['argent'] }, ordinary: { type: 'band', tincture: 'gules' }, charges: [] } as const;
  const svg = renderSvg(spec as any, { uid: 't' });
  assert.match(svg, /fill="#[0-9a-f]{6}"/i);
  assert.match(toBlazon(spec as any), /a band Gules/);
  // keepColour -> proper
  const spec2 = { ...spec, ordinary: { type: 'band', tincture: 'gules', keepColour: true } } as const;
  assert.match(toBlazon(spec2 as any), /a band proper/);
  clearOrdinaryAssets();
});

test('render: image field draws the art; blazons "a field of"', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('scene', '<svg viewBox="0 0 80 60"><rect width="80" height="60" fill="#0a7d2c"/></svg>', { label: 'Forest' }));
  const spec = { shield: 'heater', field: { mode: 'image', tinctures: ['vert'], image: 'scene' }, charges: [] } as const;
  const svg = renderSvg(spec as any, { uid: 't' });
  assert.match(svg, /#0a7d2c/);
  assert.match(toBlazon(spec as any), /a field of Forest/);
  clearFieldAssets();
});

test('render: imported variation tiles via a pattern fill', () => {
  clearVariationAssets();
  registerVariationAsset(variationFromSvg('scales', '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#334"/></svg>', { label: 'Scales' }));
  const spec = { shield: 'heater', field: { mode: 'variation', tinctures: ['or', 'azure'], variation: 'scales' }, charges: [] } as const;
  const svg = renderSvg(spec as any, { uid: 't' });
  assert.match(svg, /<pattern id="hw-var-scales-/);
  assert.match(svg, /url\(#hw-var-scales-/);
  assert.match(toBlazon(spec as any), /Scales/);
  clearVariationAssets();
});

test('clearAllAssets empties every non-charge registry', () => {
  registerShieldAsset(shieldFromSvg('x', SHIELD_SVG)!);
  registerOrdinaryAsset(ordinaryFromSvg('y', COLOR_SVG));
  clearAllAssets();
  assert.equal(shieldAssetGroups().length, 0);
  assert.ok(!isImportedOrdinary('y'));
});

test('render: imported ordinary scale grows about the shield centre', () => {
  clearOrdinaryAssets();
  registerOrdinaryAsset(ordinaryFromSvg('bar', COLOR_SVG, { label: 'bar' }));
  const base = { shield: 'heater', field: { mode: 'plain', tinctures: ['argent'] }, charges: [] };
  const at1 = renderSvg({ ...base, ordinary: { type: 'bar', tincture: 'gules', scale: 1 } } as any, { uid: 't' });
  const at2 = renderSvg({ ...base, ordinary: { type: 'bar', tincture: 'gules', scale: 2 } } as any, { uid: 't' });
  assert.ok(!/translate\(100 115\) scale/.test(at1), 'no extra scale transform at 1x');
  assert.match(at2, /translate\(100 115\) scale\(2\)/); // grows about field-box centre
  clearOrdinaryAssets();
});

import { inkBounds, cropToInk } from '../src/engine/assets';

test('inkBounds finds the true geometry box, ignoring canvas padding', () => {
  // band sits at x 30..210 within a 0..300 square canvas (padding L/R, off-centre)
  const inner = '<rect x="30" y="130" width="180" height="40" fill="#39f"/>';
  const b = inkBounds(inner);
  assert.deepEqual(b, { x: 30, y: 130, w: 180, h: 40 });
});

test('cropToInk re-origins to the ink so fitting centres on the artwork', () => {
  const svg = '<svg viewBox="0 0 300 300"><rect x="30" y="130" width="180" height="40"/></svg>';
  const out = cropToInk(svg);
  assert.match(out, /viewBox="0 0 180 40"/);
  assert.match(out, /translate\(-30 -130\)/);
});

test('render: imported ordinary centre offset shifts horizontally', () => {
  clearOrdinaryAssets();
  registerOrdinaryAsset(ordinaryFromSvg('bar2', COLOR_SVG, { label: 'bar2' }));
  const base = { shield: 'heater', field: { mode: 'plain', tinctures: ['argent'] }, charges: [] };
  const off = renderSvg({ ...base, ordinary: { type: 'bar2', tincture: 'gules', offsetX: 25 } } as any, { uid: 't' });
  assert.match(off, /translate\(40 0\)/); // 25% of 160 = 40
  const centred = renderSvg({ ...base, ordinary: { type: 'bar2', tincture: 'gules', offsetX: 0 } } as any, { uid: 't' });
  assert.ok(!/translate\(40 0\)/.test(centred), 'no 40px shift when centred');
  clearOrdinaryAssets();
});

import { generate } from '../src/engine/generate';

test('generate: empty options reproduce built-in-only output exactly', () => {
  for (const s of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']) {
    assert.deepEqual(generate(s, {}), generate(s));
  }
});

test('generate: custom pools get used across many seeds, output stays valid', () => {
  const opts = {
    shields: ['cs1'],
    charges: ['cc1'],
    ordinaries: ['co1'],
    fields: ['cf1'],
    variations: ['cv1'],
    furs: ['cfur:cu1'] as any,
  };
  let usedShield = false, usedFur = false, usedImage = false, usedCharge = false, usedOrd = false, usedVar = false;
  for (let i = 0; i < 400; i++) {
    const spec = generate(`seed-${i}`, opts);
    if (spec.shield === 'cs1') usedShield = true;
    const f = spec.field;
    if (f.tinctures.includes('cfur:cu1' as any)) usedFur = true;
    if (f.mode === 'image' && f.image === 'cf1') usedImage = true;
    if (f.mode === 'variation' && f.variation === 'cv1') usedVar = true;
    if (spec.ordinary?.type === 'co1') usedOrd = true;
    if (spec.charges.some((c) => c.charge === 'cc1')) usedCharge = true;
    // validity: shield is heater or our custom one
    assert.ok(spec.shield === 'heater' || spec.shield === 'cs1');
  }
  assert.ok(usedShield, 'custom shield appeared');
  assert.ok(usedFur, 'custom fur appeared');
  assert.ok(usedImage, 'custom image field appeared');
  assert.ok(usedVar, 'custom variation appeared');
  assert.ok(usedOrd, 'custom ordinary appeared');
  assert.ok(usedCharge, 'custom charge appeared');
});

import { hexOf } from '../src/engine/tinctures';

const FIELD_ART = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#1144cc"/><circle cx="50" cy="50" r="30" fill="#ffd700"/></svg>';

test('fieldFromSvg captures the art palette', () => {
  const a = fieldFromSvg('art', FIELD_ART, {});
  assert.ok(a.palette.includes('#1144cc'));
  assert.ok(a.palette.includes('#ffd700'));
});

test('image field keeps original colours by default', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('art', FIELD_ART, { label: 'Art' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art' }, charges: [] } as any, { uid: 'i' });
  assert.match(svg, /#1144cc/);
  assert.match(svg, /#ffd700/);
  clearFieldAssets();
});

test('image field colourMap remaps a single source colour', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('art', FIELD_ART, { label: 'Art' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art', keepColour: true, colourMap: { '#1144cc': hexOf('gules') } }, charges: [] } as any, { uid: 'i' });
  assert.ok(svg.includes(hexOf('gules')), 'remapped colour present');
  assert.ok(!svg.includes('#1144cc'), 'source blue replaced');
  assert.match(svg, /#ffd700/); // untouched colour stays
  clearFieldAssets();
});

test('image field silhouette flattens art to tinctures[0]', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('art', FIELD_ART, { label: 'Art' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['gules'], image: 'art', keepColour: false }, charges: [] } as any, { uid: 'i' });
  assert.ok(svg.includes(hexOf('gules')), 'silhouette fill applied');
  assert.ok(!svg.includes('#ffd700'), 'original gold gone');
  assert.ok(!svg.includes('#1144cc'), 'original blue gone');
  clearFieldAssets();
});

test('image field background fills behind the art', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('art', FIELD_ART, { label: 'Art' }));
  const withBg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art', bg: 'gules' }, charges: [] } as any, { uid: 'i' });
  assert.ok(withBg.includes(hexOf('gules')), 'background colour present');
  assert.match(withBg, /<rect[^>]*width="200"[^>]*height="230"/); // full-field bg rect
  assert.match(withBg, /#1144cc/); // art still drawn on top
  const noBg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art' }, charges: [] } as any, { uid: 'i' });
  assert.ok(!noBg.includes(hexOf('gules')), 'no background when unset');
  clearFieldAssets();
});

test('image field scale + offset emit a transform around the field-box centre', () => {
  clearFieldAssets();
  registerFieldAsset(fieldFromSvg('art', FIELD_ART, { label: 'Art' }));
  const svg = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art', scale: 1.3, offsetY: 10 } as any, charges: [] } as any, { uid: 'i' });
  assert.match(svg, /scale\(1\.3\)/);
  assert.match(svg, /translate\(0 [0-9.]+\)/); // offsetY = 10% of field height
  const plain = renderSvg({ shield: 'heater', field: { mode: 'image', tinctures: ['azure'], image: 'art' } as any, charges: [] } as any, { uid: 'i' });
  assert.ok(!/scale\(1\.3\)/.test(plain), 'no grow transform at defaults');
  clearFieldAssets();
});
