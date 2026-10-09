import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, segsBounds, parseTransform, multiply, flattenGeometry, svgBox, IDENTITY } from '../src/engine/svgGeometry';

const box = (b: { x: number; y: number; w: number; h: number } | null) =>
  b && [b.x, b.y, b.w, b.h].map((v) => Number(v.toFixed(3)));

test('parsePath: relative, H/V, implicit lineto after m, closepath returns to start', () => {
  const s = parsePath('m10 10 20 0 v 10 h-20 z m 5 5 l 1 1');
  assert.deepEqual(s.map((x) => x.c), ['M', 'L', 'L', 'L', 'Z', 'M', 'L']);
  assert.deepEqual((s[5] as any).p, [15, 15]); // relative to subpath start after z
  assert.deepEqual(box(segsBounds(s)), [10, 10, 20, 10]);
});

test('parsePath: compact numbers and arc flags', () => {
  const s = parsePath('M0,0L1.5.5-2-3');
  assert.deepEqual((s[1] as any).p, [1.5, 0.5]);
  assert.deepEqual((s[2] as any).p, [-2, -3]);
  // half circle, radius 10, flags written without separators
  const a = parsePath('M0 0a10 10 0 0120 0');
  assert.deepEqual(box(segsBounds(a)), [0, -10, 20, 10]);
});

test('parsePath: S/T reflect previous controls; Q becomes an exact cubic', () => {
  const q = parsePath('M0 0 Q 10 20 20 0');
  assert.deepEqual(box(segsBounds(q)), [0, 0, 20, 10]); // quad apex at half the control height
  const t = parsePath('M0 0 Q 10 20 20 0 T 40 0');
  assert.deepEqual(box(segsBounds(t)), [0, -10, 40, 20]); // reflected control dips below
});

test('parsePath: stops at malformed data, keeping the valid prefix', () => {
  const s = parsePath('M0 0 L10 10 L oops');
  assert.equal(s.length, 2);
});

test('parseTransform composes left to right', () => {
  const m = parseTransform('translate(10 5) scale(2)');
  assert.deepEqual(m, [2, 0, 0, 2, 10, 5]);
  const r = parseTransform('rotate(90 10 10)');
  assert.deepEqual(r.map((v) => Number(v.toFixed(6)) + 0), [0, 1, -1, 0, 20, 0]);
  assert.deepEqual(multiply(IDENTITY, m), m);
});

test('flattenGeometry: nested transforms, shapes, skipped subtrees', () => {
  const g = flattenGeometry(
    '<defs><rect width="999" height="999"/></defs>' +
    '<g transform="translate(100 0)"><g transform="scale(2)"><rect x="1" y="2" width="3" height="4"/></g></g>' +
    '<circle cx="0" cy="0" r="1" style="display:none"/>' +
    '<!-- <rect width="500" height="500"/> -->',
  );
  assert.deepEqual(box(g.bounds), [102, 4, 6, 8]);
  assert.match(g.d, /^M102 4 L108 4 L108 12 L102 12 Z$/);
});

test('svgBox: viewBox in either quote style, else px-converted width/height', () => {
  assert.deepEqual(svgBox(`<svg viewBox='1 2 3 4'>`), { x: 1, y: 2, w: 3, h: 4 });
  assert.deepEqual(svgBox('<svg width="96pt" height="2in">'), { x: 0, y: 0, w: 128, h: 192 });
  assert.deepEqual(svgBox('<svg width="50%">'), { x: 0, y: 0, w: 100, h: 100 });
});
