import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wmfToSvg } from '../src/engine/wmf';
import {
  chargeGroups,
  registerCharge,
  clearImportedCharges,
} from '../src/engine/charges';
import { chargeFromSvg } from '../src/engine/importCharge';

/** Assemble a minimal placeable WMF from a flat list of 16-bit words. */
function wordsToWmf(words: number[]): Uint8Array {
  const b = new Uint8Array(words.length * 2);
  const dv = new DataView(b.buffer);
  words.forEach((w, i) => dv.setUint16(i * 2, w & 0xffff, true));
  return b;
}

// A red solid-filled triangle (10,10)-(90,10)-(50,70).
function sampleWmf(): Uint8Array {
  const placeable = [
    0xcdd7, 0x9ac6, // key 0x9AC6CDD7
    0x0000,         // hwmf
    0, 0, 100, 80,  // bbox l,t,r,b
    1000,           // inch
    0, 0,           // reserved
    0x0000,         // checksum
  ];
  const header = [1, 9, 0x0300, 0, 0, 1, 0, 0, 0]; // type,size,version,sizeLo,sizeHi,objs,maxLo,maxHi,members
  const createBrush = [7, 0, 0x02fc, 0x0000, 0x00ff, 0x0000, 0x0000]; // solid, color 0x000000FF (red)
  const selectObj = [4, 0, 0x012d, 0x0000];
  const polygon = [10, 0, 0x0324, 3, 10, 10, 90, 10, 50, 70];
  const eof = [3, 0, 0x0000];
  return wordsToWmf([...placeable, ...header, ...createBrush, ...selectObj, ...polygon, ...eof]);
}

test('wmf: converts a solid polygon to an SVG path with its brush colour', () => {
  const svg = wmfToSvg(sampleWmf());
  assert.ok(svg, 'expected an SVG string');
  // viewBox is normalised to a (0,0) origin; the art is offset via a translate
  assert.match(svg!, /<svg[^>]*viewBox="0 0 80 60"/);
  assert.match(svg!, /translate\(-10 -10\)/);
  assert.match(svg!, /<path /);
  assert.match(svg!, /fill="#ff0000"/);
  // path should trace the three vertices and close
  assert.match(svg!, /M10 10 L90 10 L50 70/);
});

test('wmf: a null brush yields an unfilled path (fill none)', () => {
  const placeable = [0xcdd7, 0x9ac6, 0, 0, 0, 100, 80, 1000, 0, 0, 0];
  const header = [1, 9, 0x0300, 0, 0, 1, 0, 0, 0];
  const nullBrush = [7, 0, 0x02fc, 0x0001, 0x0000, 0x0000, 0x0000]; // BS_NULL
  const selectObj = [4, 0, 0x012d, 0x0000];
  const polygon = [10, 0, 0x0324, 3, 10, 10, 90, 10, 50, 70];
  const eof = [3, 0, 0x0000];
  const svg = wmfToSvg(wordsToWmf([...placeable, ...header, ...nullBrush, ...selectObj, ...polygon, ...eof]));
  assert.ok(svg);
  assert.match(svg!, /fill="none"/);
});

test('wmf: non-WMF / garbage input returns null', () => {
  assert.equal(wmfToSvg(new Uint8Array([1, 2, 3, 4])), null);
  assert.equal(wmfToSvg(new Uint8Array(0)), null);
});

test('wmf: output feeds chargeFromSvg and fits the 100x100 box', () => {
  const svg = wmfToSvg(sampleWmf());
  const def = chargeFromSvg('test-wmf', svg!, { recolor: true, label: 'Sample', category: 'Imports/Test' });
  assert.equal(def.category, 'Imports/Test');
  const out = def.render('#123456');
  assert.match(out, /transform="translate/);
  assert.match(out, /scale/);
});

test('charges: imported charges group by category, built-ins first', () => {
  clearImportedCharges();
  const svg = wmfToSvg(sampleWmf())!;
  registerCharge(chargeFromSvg('eagle', svg, { label: 'Eagle', category: 'Animals/Birds' }));
  registerCharge(chargeFromSvg('lion', svg, { label: 'Lion', category: 'Animals' }));
  registerCharge(chargeFromSvg('loose', svg, { label: 'Loose' })); // no category -> "Imported"
  const groups = chargeGroups();
  assert.equal(groups[0].label, 'Built-in', 'built-ins should come first');
  const labels = groups.map((g) => g.label);
  assert.ok(labels.includes('Animals'), 'has Animals group');
  assert.ok(labels.includes('Animals/Birds'), 'has nested Animals/Birds group');
  assert.ok(labels.includes('Imported'), 'uncategorised import falls back to Imported');
  assert.deepEqual(groups.find((g) => g.label === 'Animals')!.ids, ['lion']);
  assert.deepEqual(groups.find((g) => g.label === 'Animals/Birds')!.ids, ['eagle']);
  clearImportedCharges();
});

import { toBlazon } from '../src/engine/blazon';

const COLOR_SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>';

test('charge colours: default recolours, keepColour preserves original', () => {
  const def = chargeFromSvg('c-recolor', COLOR_SVG, { recolor: true });
  const recoloured = def.render('#0000ff');
  assert.ok(!recoloured.includes('#ff0000'), 'original red stripped when recolouring');
  assert.match(recoloured, /fill="#0000ff"/);
  const kept = def.render('#0000ff', { keepColour: true });
  assert.match(kept, /#ff0000/, 'original red preserved when keepColour');
});

test('charge colours: import default recolor=false keeps colour, override recolours', () => {
  const def = chargeFromSvg('c-keep', COLOR_SVG, { recolor: false });
  assert.match(def.render('#000000'), /#ff0000/, 'preserves by default when imported with recolour off');
  assert.ok(!def.render('#000000', { keepColour: false }).includes('#ff0000'), 'per-instance override recolours');
});

test('blazon: a keepColour charge is blazoned "proper"', () => {
  clearImportedCharges();
  registerCharge(chargeFromSvg('achievement', COLOR_SVG, { label: 'achievement' }));
  const spec = {
    shield: 'heater',
    field: { mode: 'plain', tinctures: ['argent'] },
    charges: [
      { charge: 'achievement', tincture: 'gules', count: 1, arrangement: 'one', position: 'center', keepColour: true },
    ],
  } as const;
  const b = toBlazon(spec as any);
  assert.match(b, /proper/, 'original-colour charge reads as proper');
  assert.ok(!/gules/.test(b), 'tincture name suppressed when proper');
  clearImportedCharges();
});

import { extractPalette, applyColourMap } from '../src/engine/importCharge';

const MULTI_SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="6" fill="#FF0000"/><rect y="6" width="10" height="4" fill="#00ff00" stroke="none"/></svg>';

test('palette: distinct colours extracted, lower-cased, none excluded', () => {
  const pal = extractPalette(MULTI_SVG);
  assert.deepEqual(pal, ['#ff0000', '#00ff00']);
});

test('palette: applyColourMap remaps chosen colours, keeps the rest', () => {
  const out = applyColourMap(MULTI_SVG, { '#ff0000': '#123456' });
  assert.match(out, /fill="#123456"/);
  assert.match(out, /fill="#00ff00"/); // untouched
  assert.ok(!out.includes('#FF0000') && !out.includes('#ff0000'));
});

test('charge: def exposes palette and render honours colourMap under keepColour', () => {
  const def = chargeFromSvg('multi', MULTI_SVG, { label: 'Multi' });
  assert.deepEqual(def.palette, ['#ff0000', '#00ff00']);
  const out = def.render('#000000', { keepColour: true, colourMap: { '#ff0000': '#0000ff' } });
  assert.match(out, /#0000ff/, 'mapped colour applied');
  assert.match(out, /#00ff00/, 'unmapped colour preserved');
  // colourMap ignored when not keeping colour (silhouette)
  const sil = def.render('#abcdef', { keepColour: false, colourMap: { '#ff0000': '#0000ff' } });
  assert.match(sil, /#abcdef/);
  assert.ok(!sil.includes('#0000ff'));
});
