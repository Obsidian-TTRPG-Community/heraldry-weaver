import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSvg, furSwatchSvg } from '../src/engine/render';
import { toBlazon } from '../src/engine/blazon';
import { shieldPath } from '../src/engine/shields';
import { SHIELDS } from '../src/engine/options';
import { furInfo, makeFur, labelOf, contrasts } from '../src/engine/tinctures';
import type { Spec } from '../src/engine/types';

const base = (over: Partial<Spec> = {}): Spec => ({
  shield: 'heater',
  field: { mode: 'plain', tinctures: ['azure'] },
  charges: [],
  ...over,
});

test('shapes: every shield shape has a distinct path and renders', () => {
  const paths = new Set<string>();
  for (const s of SHIELDS) {
    const p = shieldPath(s);
    assert.ok(p.startsWith('M'), `${s} path malformed`);
    paths.add(p);
    const svg = renderSvg(base({ shield: s }), { uid: `shape-${s}` });
    assert.ok(svg.includes(p), `${s} path not used in render`);
  }
  assert.equal(paths.size, SHIELDS.length, 'shapes share paths');
});

test('furs: ermine field emits a pattern def and references it', () => {
  const svg = renderSvg(base({ field: { mode: 'plain', tinctures: ['ermine'] } }), { uid: 'fur1' });
  const m = svg.match(/<pattern id="(hw-fur-ermine-[^"]+)"/);
  assert.ok(m, 'no ermine pattern');
  assert.ok(svg.includes(`url(#${m![1]})`), 'pattern not referenced');
});

test('furs: vair on one half of a division', () => {
  const spec = base({ field: { mode: 'division', division: 'per-pale', tinctures: ['vair', 'gules'] } });
  const svg = renderSvg(spec, { uid: 'fur2' });
  const m = svg.match(/<pattern id="(hw-fur-vair-[^"]+)"/);
  assert.ok(m, 'no vair pattern');
  assert.ok(svg.includes(`url(#${m![1]})`), 'pattern not referenced');
  assert.equal(toBlazon(spec), 'Per pale Vair and Gules');
});

test('ids: two renders with the same uid get distinct clip/pattern ids', () => {
  const spec = base({ field: { mode: 'plain', tinctures: ['ermine'] } });
  const a = renderSvg(spec, { uid: 'dup' });
  const b = renderSvg(spec, { uid: 'dup' });
  const idA = a.match(/<clipPath id="([^"]+)"/)![1];
  const idB = b.match(/<clipPath id="([^"]+)"/)![1];
  assert.notEqual(idA, idB, 'clip ids collided across renders');
  const patA = a.match(/<pattern id="([^"]+)"/)![1];
  const patB = b.match(/<pattern id="([^"]+)"/)![1];
  assert.notEqual(patA, patB, 'pattern ids collided across renders');
});

test('layered: multiple charge groups render and blazon with zones', () => {
  const spec = base({
    field: { mode: 'plain', tinctures: ['or'] },
    charges: [
      { charge: 'roundel', tincture: 'gules', count: 1, arrangement: 'one', zone: 'field' },
      { charge: 'mullet', tincture: 'azure', count: 3, arrangement: 'in-fess', zone: 'chief' },
    ],
  });
  const blz = toBlazon(spec);
  assert.ok(blz.includes('in chief'), `zone missing: ${blz}`);
  const svg = renderSvg(spec, { uid: 'layer' });
  // 1 field roundel + 3 chief mullets => 4 charge transforms
  const groups = svg.split('translate(').length - 1;
  assert.ok(groups >= 4, `expected layered transforms, got ${groups}`);
});

test('layered: zone defaults to field when omitted', () => {
  const spec = base({
    charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one' }],
  });
  const svg = renderSvg(spec, { uid: 'z' });
  assert.ok(svg.includes('<svg'));
  assert.equal(toBlazon(spec), 'Azure, a mullet Or');
});

test('scale: per-group size multiplies the charge transform', () => {
  const big = renderSvg(base({ charges: [{ charge: 'roundel', tincture: 'or', count: 1, arrangement: 'one' }] }), { uid: 's1' });
  // default field size 78 => scale 0.78
  assert.ok(big.includes('scale(0.78)'), 'default scale missing');
  const half = renderSvg(base({ charges: [{ charge: 'roundel', tincture: 'or', count: 1, arrangement: 'one', scale: 0.5 }] }), { uid: 's2' });
  // 78 * 0.5 / 100 = 0.39
  assert.ok(half.includes('scale(0.39)'), 'half scale not applied');
});

test('scale: layered charges can differ in size at the same centre', () => {
  const svg = renderSvg(base({
    field: { mode: 'plain', tinctures: ['azure'] },
    charges: [
      { charge: 'roundel', tincture: 'or', count: 1, arrangement: 'one', scale: 1.3 },
      { charge: 'mullet', tincture: 'gules', count: 1, arrangement: 'one', scale: 0.6 },
    ],
  }), { uid: 'layer-size' });
  // 78*1.3/100 = 1.014 ; 78*0.6/100 = 0.468
  assert.ok(svg.includes('scale(1.014)'), 'large layer missing');
  assert.ok(svg.includes('scale(0.468)'), 'small layer missing');
});

test('position: each anchor places the charge at a distinct centre', () => {
  const centres = new Map<string, string>();
  for (const pos of ['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'] as const) {
    const svg = renderSvg(base({ charges: [{ charge: 'roundel', tincture: 'or', count: 1, arrangement: 'one', position: pos }] }), { uid: `p-${pos}` });
    const m = svg.match(/translate\(([-\d.]+),([-\d.]+)\)/g);
    assert.ok(m && m.length >= 1, `${pos} did not render`);
    centres.set(pos, m![m!.length - 1]);
  }
  // top row shares a y; columns share an x — at least ensure 9 distinct transforms
  assert.equal(new Set(centres.values()).size, 9, 'positions collide');
});

test('position: blazon uses dexter/sinister chief and base', () => {
  const mk = (position: any) => toBlazon(base({ charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one', position }] }));
  assert.equal(mk('top-left'), 'Azure, a mullet Or in dexter chief');
  assert.equal(mk('top-right'), 'Azure, a mullet Or in sinister chief');
  assert.equal(mk('bottom-left'), 'Azure, a mullet Or in dexter base');
  assert.equal(mk('right'), 'Azure, a mullet Or to sinister');
  assert.equal(mk('center'), 'Azure, a mullet Or');
});

test('position: old zone data still resolves (chief -> top)', () => {
  assert.equal(toBlazon(base({ charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one', zone: 'chief' }] })), 'Azure, a mullet Or in chief');
});

test('mirror: flipX negates the x scale and keeps the centre', () => {
  const plain = renderSvg(base({ charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one' }] }), { uid: 'f0' });
  assert.ok(plain.includes('scale(0.78)'), 'unflipped should stay single-arg');
  const fx = renderSvg(base({ charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one', flipX: true }] }), { uid: 'f1' });
  assert.ok(fx.includes('scale(-0.78,0.78)'), 'flipX scale missing');
  // centre x stays 100: tx = 100 - 50*(-0.78) = 139
  assert.ok(fx.includes('translate(139,'), `flipX translate wrong: ${fx.match(/translate\([^)]*\)/)}`);
});

test('mirror: flipY negates the y scale', () => {
  const fy = renderSvg(base({ charges: [{ charge: 'mullet', tincture: 'or', count: 1, arrangement: 'one', flipY: true }] }), { uid: 'f2' });
  assert.ok(fy.includes('scale(0.78,-0.78)'), 'flipY scale missing');
});

test('mirror: blazon reflects reversed / inverted', () => {
  const mk = (over: any) => toBlazon(base({ charges: [{ charge: 'lion', tincture: 'or', count: 1, arrangement: 'one', ...over }] }));
  assert.ok(mk({ flipX: true }).includes('reversed'));
  assert.ok(mk({ flipY: true }).includes('inverted'));
  assert.ok(mk({ flipX: true, flipY: true }).includes('reversed and inverted'));
});

test('fur presets: named variants resolve to pattern + colours', () => {
  assert.deepEqual(furInfo('erminois'), { pattern: 'ermine', base: 'or', figure: 'sable', counter: false });
  assert.deepEqual(furInfo('counter-vair'), { pattern: 'vair', base: 'argent', figure: 'azure', counter: true });
  assert.deepEqual(furInfo('potent'), { pattern: 'potent', base: 'argent', figure: 'azure', counter: false });
  assert.equal(furInfo('gules'), null);
});

test('fur labels: presets named, customs described', () => {
  assert.equal(labelOf('pean'), 'Pean');
  assert.equal(labelOf('counter-potent'), 'Counter-potent');
  assert.equal(labelOf(makeFur('vair', 'or', 'gules')), 'Vairy Or and Gules');
  assert.equal(labelOf(makeFur('ermine', 'gules', 'or')), 'Gules ermined Or');
  // A custom combo equal to a preset is recognised by name.
  assert.equal(labelOf(makeFur('ermine', 'argent', 'sable')), 'Ermine');
});

test('custom fur renders a pattern with its own colours', () => {
  const t = makeFur('vair', 'or', 'gules', true);
  const svg = renderSvg(base({ field: { mode: 'plain', tinctures: [t] } }), { uid: 'cf' });
  const m = svg.match(/<pattern id="(hw-fur-vair-or-gules-c-[^"]+)"/);
  assert.ok(m, `custom vair pattern id missing: ${svg.match(/hw-fur[^"]*/)}`);
  assert.ok(svg.includes('fill="#E0A82E"'), 'base Or not used');
  assert.ok(svg.includes('fill="#B23A2E"'), 'figure Gules not used');
});

test('furs still contrast with everything', () => {
  assert.ok(contrasts('erminois', 'or'));
  assert.ok(contrasts(makeFur('potent', 'gules', 'or'), 'gules'));
});

test('fur swatch SVG carries the xmlns so it renders when DOM-parsed', () => {
  const svg = furSwatchSvg('ermine');
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'swatch svg missing xmlns');
  assert.ok(svg.includes('viewBox='));
});
