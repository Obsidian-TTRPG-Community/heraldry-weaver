import { test } from 'node:test';
import { generate } from '../src/engine/generate';
import assert from 'node:assert/strict';

import { PACK_CHARGES, PACK_IDS } from '../src/engine/packCharges';
import { registerBundledCharge, getCharge, listChargeIds, CHARGE_IDS } from '../src/engine/charges';
import { renderSvg } from '../src/engine/render';
import type { Spec } from '../src/engine/types';

test('pack: loads a healthy set of charges', () => {
  assert.ok(PACK_IDS.length >= 20, `only ${PACK_IDS.length} pack charges`);
  assert.ok(PACK_IDS.includes('lion'));
  assert.ok(PACK_IDS.includes('eagle-emblem'));
});

test('pack: charges are clean silhouettes (no bg rect, recolourable)', () => {
  for (const def of PACK_CHARGES) {
    const svg = def.render('#B23A2E');
    assert.ok(!svg.includes('M0 0h512v512H0z'), `${def.id} kept its background`);
    assert.ok(!/fill="#fff"/i.test(svg), `${def.id} kept a white fill`);
    assert.ok(svg.includes('#B23A2E'), `${def.id} did not recolour`);
  }
});

test('pack: registers as bundled, resolvable, excluded from random gen', () => {
  for (const def of PACK_CHARGES) registerBundledCharge(def);
  assert.ok(getCharge('lion'));
  assert.ok(listChargeIds().includes('lion'));
  // generation pool stays curated/built-in
  assert.ok(!CHARGE_IDS.includes('lion'));
});

test('pack: a pack charge renders inside a full spec', () => {
  for (const def of PACK_CHARGES) registerBundledCharge(def);
  const spec: Spec = {
    shield: 'heater',
    field: { mode: 'plain', tinctures: ['argent'] },
    charges: [{ charge: 'eagle-emblem', tincture: 'sable', count: 1, arrangement: 'one' }],
  };
  const svg = renderSvg(spec, { uid: 'pack-test' });
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  assert.ok(svg.includes('#1A1A1A'));
});

test('pack: bundled charges appear in random rolls once registered', () => {
  for (const def of PACK_CHARGES) registerBundledCharge(def);
  const ids = new Set(PACK_IDS);
  const seeds = Array.from({ length: 400 }, (_, i) => `roll-${i}`);
  let sawPack = false;
  for (const s of seeds) {
    for (const g of generate(s).charges) {
      if (ids.has(g.charge)) { sawPack = true; break; }
    }
    if (sawPack) break;
  }
  assert.ok(sawPack, 'pack charges never appeared in rolls');
});
