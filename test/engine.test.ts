import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generate } from '../src/engine/generate';
import { toBlazon } from '../src/engine/blazon';
import { renderSvg } from '../src/engine/render';
import { generateArms } from '../src/engine/index';
import { contrasts, GENERATABLE, FURS, labelOf } from '../src/engine/tinctures';
import { getCharge } from '../src/engine/charges';
import type { Tincture } from '../src/engine/types';

const SEEDS = Array.from({ length: 600 }, (_, i) => `seed-${i}`).concat([
  'Restov',
  'Tuskwater',
  'Pitax',
  'New Stetven',
  'Mivon',
]);

test('determinism: same seed yields deep-equal spec', () => {
  for (const s of ['Restov', 'Pitax', 'seed-42', 'House Surtova']) {
    assert.deepEqual(generate(s), generate(s));
  }
});

test('determinism: spec + blazon stable; svg stable up to unique ids', () => {
  const a = generateArms('Restov');
  const b = generateArms('Restov');
  assert.deepEqual(a.spec, b.spec);
  assert.equal(a.blazon, b.blazon);
  // Clip/pattern ids carry a per-render counter for uniqueness; strip it before
  // comparing so the actual geometry is still asserted deterministic.
  const stripIds = (s: string) => s.replace(/-\d+(["')])/g, "$1");
  assert.equal(stripIds(a.svg), stripIds(b.svg));
});

test('distinctness: different seeds usually differ', () => {
  const blazons = new Set(SEEDS.map((s) => toBlazon(generate(s))));
  // Not all unique (small design space), but should be plenty varied.
  assert.ok(blazons.size > 40, `only ${blazons.size} distinct blazons`);
});

test('rule of tincture: overlays contrast with the field primary', () => {
  for (const s of SEEDS) {
    const spec = generate(s);
    const primary = spec.field.tinctures[0];
    if (spec.ordinary) {
      assert.ok(
        contrasts(primary, spec.ordinary.tincture),
        `ordinary ${spec.ordinary.tincture} on ${primary} for "${s}"`,
      );
    }
    for (const g of spec.charges) {
      assert.ok(
        contrasts(primary, g.tincture),
        `charge ${g.tincture} on ${primary} for "${s}"`,
      );
    }
  }
});

test('rule of tincture: divided/varied fields use contrasting tinctures', () => {
  for (const s of SEEDS) {
    const f = generate(s).field;
    if (f.mode !== 'plain') {
      assert.equal(f.tinctures.length, 2);
      assert.ok(
        contrasts(f.tinctures[0], f.tinctures[1]),
        `field ${f.tinctures.join('/')} for "${s}"`,
      );
    }
  }
});

test('overlays only sit on plain fields (v0.1 invariant)', () => {
  for (const s of SEEDS) {
    const spec = generate(s);
    if (spec.field.mode !== 'plain') {
      assert.equal(spec.ordinary, undefined);
      assert.equal(spec.charges.length, 0);
    }
  }
});

test('field tinctures may be metals, colours, or furs; overlays stay metal/colour', () => {
  const fieldOk = new Set<Tincture>([...GENERATABLE, ...FURS]);
  const overlayOk = new Set<Tincture>(GENERATABLE);
  for (const s of SEEDS) {
    const spec = generate(s);
    for (const t of spec.field.tinctures) assert.ok(fieldOk.has(t), `field ${t}`);
    if (spec.ordinary) assert.ok(overlayOk.has(spec.ordinary.tincture), `ordinary ${spec.ordinary.tincture}`);
    for (const g of spec.charges) assert.ok(overlayOk.has(g.tincture), `charge ${g.tincture}`);
  }
});

test('generation produces fur fields sometimes but not always', () => {
  const furred = SEEDS.filter((s) => generate(s).field.tinctures.some((t) => (FURS as readonly string[]).includes(t)));
  assert.ok(furred.length > 0, 'no fur fields at all');
  assert.ok(furred.length < SEEDS.length * 0.4, 'furs too frequent');
});

test('all generated charges resolve in the registry', () => {
  for (const s of SEEDS) {
    for (const g of generate(s).charges) {
      assert.ok(getCharge(g.charge), `unknown charge ${g.charge}`);
    }
  }
});

test('charge counts and arrangements are coherent', () => {
  for (const s of SEEDS) {
    for (const g of generate(s).charges) {
      assert.ok(g.count >= 1 && g.count <= 3);
      if (g.count === 1) assert.equal(g.arrangement, 'one');
      if (g.count === 3) assert.equal(g.arrangement, 'two-and-one');
    }
  }
});

test('blazon: non-empty, starts with a capital, names a tincture', () => {
  for (const s of SEEDS.slice(0, 100)) {
    const b = toBlazon(generate(s));
    assert.ok(b.length > 0);
    assert.match(b[0], /[A-Z]/);
    const named = [...GENERATABLE, ...FURS].some((t) => b.includes(labelOf(t)));
    assert.ok(named, `no tincture named in "${b}"`);
  }
});

test('blazon: plain field with no content is just the tincture', () => {
  // find a seed producing a bare plain field
  const bare = SEEDS.find((s) => {
    const spec = generate(s);
    return (
      spec.field.mode === 'plain' && !spec.ordinary && spec.charges.length === 0
    );
  });
  assert.ok(bare, 'expected at least one bare plain field in sample');
  const spec = generate(bare!);
  assert.equal(toBlazon(spec), labelOf(spec.field.tinctures[0]));
});

test('render: produces a well-formed standalone svg', () => {
  for (const s of SEEDS.slice(0, 100)) {
    const svg = renderSvg(generate(s), { uid: s });
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.trim().endsWith('</svg>'));
    assert.ok(svg.includes('viewBox="0 0 200 230"'));
    assert.ok(svg.includes('clip-path'));
    // balanced svg tags
    assert.equal((svg.match(/<svg/g) ?? []).length, 1);
    assert.equal((svg.match(/<\/svg>/g) ?? []).length, 1);
  }
});

test('render: unique uids keep clip ids distinct', () => {
  const a = renderSvg(generate('A'), { uid: 'A' });
  const b = renderSvg(generate('B'), { uid: 'B' });
  assert.ok(a.includes('hw-clip-A'));
  assert.ok(b.includes('hw-clip-B'));
});

test('render: unsafe uid chars are sanitised in clip ids', () => {
  const svg = renderSvg(generate('House Surtova'), { uid: 'demo-House Surtova' });
  assert.ok(svg.includes('hw-clip-demo-House_Surtova'));
  // no clip id contains a space
  assert.doesNotMatch(svg, /id="hw-clip-[^"]* /);
  // the id and its url(#...) reference agree
  const id = svg.match(/id="(hw-clip-[^"]+)"/)![1];
  assert.ok(svg.includes(`url(#${id})`));
});

import { generateName } from '../src/engine/names';

test('names: deterministic, non-empty, capitalised', () => {
  for (const s of SEEDS.slice(0, 200)) {
    const a = generateName(s);
    const b = generateName(s);
    assert.equal(a, b);
    assert.ok(a.length > 0);
    assert.match(a, /^[A-Z]/);
  }
});

test('names: produce a healthy variety', () => {
  const set = new Set(SEEDS.map(generateName));
  assert.ok(set.size > 80, `only ${set.size} distinct names`);
});

test('names: some are houses, some are places', () => {
  const names = SEEDS.map(generateName);
  assert.ok(names.some((n) => n.startsWith('House ')));
  assert.ok(names.some((n) => !n.startsWith('House ')));
});
