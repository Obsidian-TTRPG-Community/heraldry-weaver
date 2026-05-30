import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_SECTIONS, GUIDE_INTRO } from '../src/guide';
import { toBlazon } from '../src/engine/blazon';
import { renderSvg } from '../src/engine/render';
import { getCharge, registerBundledCharge } from '../src/engine/charges';
import { PACK_CHARGES } from '../src/engine/packCharges';

// The guide references pack charges (lion, fleur, ...), so register the pack.
PACK_CHARGES.forEach(registerBundledCharge);

test('guide has sections and an intro', () => {
  assert.ok(GUIDE_INTRO.length > 40);
  assert.ok(GUIDE_SECTIONS.length >= 6, 'expected several sections');
});

test('every guide entry is well formed and renders', () => {
  for (const section of GUIDE_SECTIONS) {
    assert.ok(section.title, 'section missing title');
    assert.ok(section.entries.length > 0, `section ${section.title} is empty`);
    for (const entry of section.entries) {
      assert.ok(entry.name, 'entry missing name');
      // "a line or two" — keep notes short.
      assert.ok(entry.note.length > 0 && entry.note.length <= 160, `note too long: ${entry.name}`);
      // Renders to an SVG and blazons without throwing.
      const svg = renderSvg(entry.spec, { uid: `t-${entry.name}` });
      assert.ok(svg.startsWith('<svg'), `did not render: ${entry.name}`);
      assert.ok(toBlazon(entry.spec).length > 0, `no blazon: ${entry.name}`);
      // Any charge referenced must resolve.
      for (const g of entry.spec.charges) {
        assert.ok(getCharge(g.charge), `unknown charge in guide: ${g.charge}`);
      }
    }
  }
});
