import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chargeFromSvg, stripColours } from '../src/engine/importCharge';
import {
  registerCharge,
  clearImportedCharges,
  getCharge,
  isImported,
  listChargeIds,
  CHARGE_IDS,
} from '../src/engine/charges';
import { arrangementsFor, ORDINARIES, DIVISIONS } from '../src/engine/options';

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80"><rect x="0" y="0" width="64" height="80" fill="#123456"/><circle cx="32" cy="40" r="10" fill="none"/></svg>';

test('stripColours removes coloured fills but keeps none', () => {
  const out = stripColours('<rect fill="#abc"/><circle fill="none"/><path stroke="red"/>');
  assert.ok(!out.includes('#abc'));
  assert.ok(!out.includes('stroke="red"'));
  assert.ok(out.includes('fill="none"'));
});

test('chargeFromSvg normalises to the 100 box and recolours', () => {
  const def = chargeFromSvg('myCharge', SAMPLE, { recolor: true, label: 'my charge' });
  const svg = def.render('#ff0000');
  assert.equal(def.id, 'myCharge');
  assert.equal(def.singular, 'my charge');
  assert.ok(svg.includes('scale('), 'should normalise via a scale transform');
  assert.ok(svg.includes('#ff0000'), 'recolour fill applied');
  assert.ok(!svg.includes('#123456'), 'original colour stripped');
  assert.ok(svg.includes('fill="none"'), 'none preserved');
});

test('chargeFromSvg can keep original colours', () => {
  const def = chargeFromSvg('keep', SAMPLE, { recolor: false });
  const svg = def.render('#ff0000');
  assert.ok(svg.includes('#123456'), 'original colour kept');
});

test('registry: imported charges resolve and list, builtins unaffected', () => {
  clearImportedCharges();
  const before = listChargeIds().length;
  registerCharge(chargeFromSvg('imp1', SAMPLE));
  assert.ok(isImported('imp1'));
  assert.ok(getCharge('imp1'));
  assert.equal(listChargeIds().length, before + 1);
  // generation set is unchanged
  assert.ok(!CHARGE_IDS.includes('imp1'));
  clearImportedCharges();
  assert.ok(!isImported('imp1'));
  assert.equal(getCharge('imp1'), undefined);
});

test('options: arrangements match counts; lists are non-empty', () => {
  assert.deepEqual(arrangementsFor(1), ['one']);
  assert.deepEqual(arrangementsFor(2), ['in-fess', 'in-pale']);
  assert.deepEqual(arrangementsFor(3), ['two-and-one']);
  assert.ok(ORDINARIES.length > 0 && DIVISIONS.length > 0);
});
