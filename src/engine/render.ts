import { shieldPath, builtinShieldPath, SHIELD_W, SHIELD_H, FIELD_BOUNDS } from './shields';
import { flagFrame, type FlagFrame } from './frames';
import {
  getOrdinaryAsset,
  getShieldAsset,
  getFieldAsset,
  getVariationAsset,
  fitTransform,
} from './assets';
import { hexOf, furInfo, parseCustomFur } from './tinctures';
import type { FurInfo } from './tinctures';
import { getCharge } from './charges';
import { stripColours, applyColourMap } from './importCharge';
import { positionOf } from './options';
import type {
  Spec,
  Field,
  Ordinary,
  ChargeGroup,
  Arrangement,
  Tincture,
  Position,
} from './types';

export interface RenderOptions {
  /** Unique id suffix so multiple shields can coexist on one page. */
  uid?: string | number;
  /** Outline colour. */
  outline?: string;
}

let counter = 0;
function n(v: number): string {
  return Number(v.toFixed(3)).toString();
}

/** Make a uid safe to embed in an SVG id / url(#...) reference. */
function safeId(uid: string | number): string {
  return String(uid).replace(/[^A-Za-z0-9_-]/g, '_');
}

// --- furs (pattern fills) -----------------------------------------------------

interface Defs {
  uid: string;
  patterns: Map<string, string>; // id -> markup
}

/** An ermine spot (Breton moucheture): spindle body with a three-pronged
 *  tail and three curled pips fanned above. Centred on its local origin. */
function ermineSpot(): string {
  return (
    `<path d="M0 -16 C3 -14.5 3.8 -6 2.3 0 C5.6 1.8 9 6.5 8.4 11 C5.6 9.6 3.4 8.8 2.2 11.8 L0 18 L-2.2 11.8 C-3.4 8.8 -5.6 9.6 -8.4 11 C-9 6.5 -5.6 1.8 -2.3 0 C-3.8 -6 -3 -14.5 0 -16 Z"/>` +
    `<path d="M0 -26 C2 -26 1.6 -20.5 0 -18 C-1.6 -20.5 -2 -26 0 -26 Z"/>` +
    `<path d="M-7.5 -23 C-5.6 -24 -2.6 -19.8 -3.9 -16.3 C-7.3 -18 -9.4 -22 -7.5 -23 Z"/>` +
    `<path d="M7.5 -23 C5.6 -24 2.6 -19.8 3.9 -16.3 C7.3 -18 9.4 -22 7.5 -23 Z"/>`
  );
}

// Vair pane (azure-over-argent by default): wide flat top, shoulders slanting
// to a straight stem, tapering to a point. Top half-width is twice the stem
// half-width, so the blue down-panes and the argent up-panes (negative space)
// interlock as a true edge-sharing tessellation. Cell 40 wide x 55 tall, so
// exactly four panes span the 160-wide field (see furPattern offset below).
const VAIR_DOWN = 'M0 0 L40 0 L30 16 L30 39 L20 55 L10 39 L10 16 Z';
// Mirrored pane seated a row below, for counter-vair (panes meet point-to-point).
const VAIR_UP = 'M20 55 L30 71 L30 94 L40 110 L0 110 L10 94 L10 71 Z';
const POTENT_DOWN = 'M0 0 H40 V6 H23 V20 H17 V6 H0 Z';
const POTENT_UP = 'M0 40 H40 V34 H23 V20 H17 V34 H0 Z';

/** Inner markup (rect + figures) for a fur tile, given its colours. */
function furTile(info: FurInfo): { w: number; h: number; body: string } {
  const base = hexOf(info.base);
  const fig = hexOf(info.figure);
  if (info.pattern === 'ermine') {
    return {
      w: 44, h: 56,
      body:
        `<rect width="44" height="56" fill="${base}"/>` +
        `<g fill="${fig}"><g transform="translate(11,24)">${ermineSpot()}</g>` +
        `<g transform="translate(33,52)">${ermineSpot()}</g></g>`,
    };
  }
  if (info.pattern === 'vair') {
    // Standard (aligned) vair: one down-pane per cell; the argent up-panes are
    // the negative space. Counter-vair stacks a mirrored pane so the panes meet
    // point-to-point. Either way the figure/base colours drive the tincture.
    if (info.counter) {
      return {
        w: 40, h: 110,
        body:
          `<rect width="40" height="110" fill="${base}"/>` +
          `<g fill="${fig}"><path d="${VAIR_DOWN}"/><path d="${VAIR_UP}"/></g>`,
      };
    }
    return {
      w: 40, h: 55,
      body:
        `<rect width="40" height="55" fill="${base}"/>` +
        `<path fill="${fig}" d="${VAIR_DOWN}"/>`,
    };
  }
  // potent: angular crutches in offset rows; only the second-row figure flips.
  const second = info.counter ? POTENT_UP : POTENT_DOWN;
  return {
    w: 40, h: 40,
    body:
      `<rect width="40" height="40" fill="${base}"/>` +
      `<g fill="${fig}"><path d="${POTENT_DOWN}"/>` +
      `<g transform="translate(-20,20)"><path d="${second}"/></g>` +
      `<g transform="translate(20,20)"><path d="${second}"/></g></g>`,
  };
}

/** A small standalone fur tile for UI swatches (no <defs>/pattern needed). */
export function furSwatchSvg(t: Tincture): string {
  const cf = parseCustomFur(t);
  if (cf) {
    const body = cf.target
      ? `<g fill="${hexOf(cf.target)}" stroke="${hexOf(cf.target)}">${stripColours(cf.def.inner)}</g>`
      : cf.def.inner;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cf.def.w} ${cf.def.h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">` +
      `${body}</svg>`
    );
  }
  const info = furInfo(t);
  if (!info) return '';
  const { w, h, body } = furTile(info);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">` +
    `${body}</svg>`
  );
}

function furPattern(info: FurInfo, id: string): string {
  const { w, h, body } = furTile(info);
  // Start the tiling at the field's top-left corner so the pattern aligns with
  // the shield edges (for vair, the four panes then sit flush left-to-right).
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse"` +
    ` x="${FIELD_BOUNDS.x0}" y="${FIELD_BOUNDS.y0}" width="${w}" height="${h}">${body}</pattern>`
  );
}

/** Resolve a FIELD tincture to a fill, registering a pattern def for furs. */
function paint(t: Tincture, defs: Defs): string {
  const info = furInfo(t);
  if (info) {
    const key = `${info.pattern}-${info.base}-${info.figure}${info.counter ? '-c' : ''}`;
    const id = `hw-fur-${key}-${defs.uid}`;
    if (!defs.patterns.has(id)) defs.patterns.set(id, furPattern(info, id));
    return `url(#${id})`;
  }
  const cf = parseCustomFur(t);
  if (cf) {
    const safe = (t as string).replace(/[^A-Za-z0-9]+/g, '-');
    const id = `hw-cfur-${safe}-${defs.uid}`;
    if (!defs.patterns.has(id)) defs.patterns.set(id, customFurPattern(cf.def, cf.target, id));
    return `url(#${id})`;
  }
  return hexOf(t);
}

/** A custom fur fills by COVER (these sheets are pre-tiled semés, so a single
 *  cover-fit tile over the whole canvas reads correctly; divisions show slices). */
function customFurPattern(def: { inner: string; w: number; h: number }, target: Tincture | undefined, id: string): string {
  const box = {
    x: FIELD_BOUNDS.x0, y: FIELD_BOUNDS.y0,
    w: FIELD_BOUNDS.x1 - FIELD_BOUNDS.x0, h: FIELD_BOUNDS.y1 - FIELD_BOUNDS.y0,
  };
  const t = fitTransform({ x: 0, y: 0, w: def.w, h: def.h }, box, 'cover');
  const body = target
    ? `<g fill="${hexOf(target)}" stroke="${hexOf(target)}">${stripColours(def.inner)}</g>`
    : def.inner;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${SHIELD_W}" height="${SHIELD_H}">` +
    `<g transform="${t}">${body}</g></pattern>`;
}

// --- field regions -----------------------------------------------------------

function divisionRegions(field: Field, defs: Defs): string {
  const a = paint(field.tinctures[0], defs);
  const b = paint(field.tinctures[1] ?? field.tinctures[0], defs);
  switch (field.division) {
    case 'per-pale':
      return (
        `<rect x="0" y="0" width="100" height="230" fill="${a}"/>` +
        `<rect x="100" y="0" width="100" height="230" fill="${b}"/>`
      );
    case 'per-fess':
      return (
        `<rect x="0" y="0" width="200" height="115" fill="${a}"/>` +
        `<rect x="0" y="115" width="200" height="115" fill="${b}"/>`
      );
    case 'per-bend':
      return (
        `<path d="M0 -8.75 L200 238.75 L200 -20 L0 -20 Z" fill="${a}"/>` +
        `<path d="M0 -8.75 L200 238.75 L200 250 L0 250 Z" fill="${b}"/>`
      );
    case 'per-chevron':
      return (
        `<rect x="0" y="0" width="200" height="230" fill="${a}"/>` +
        `<path d="M0 230 L100 120 L200 230 L200 252 L0 252 Z" fill="${b}"/>`
      );
    case 'per-saltire':
      return (
        `<rect x="0" y="0" width="200" height="230" fill="${b}"/>` +
        `<path d="M0 0 L200 0 L100 115 Z" fill="${a}"/>` +
        `<path d="M0 230 L200 230 L100 115 Z" fill="${a}"/>`
      );
    case 'quarterly':
      return (
        `<rect x="0" y="0" width="200" height="230" fill="${b}"/>` +
        `<rect x="0" y="0" width="100" height="115" fill="${a}"/>` +
        `<rect x="100" y="115" width="100" height="115" fill="${a}"/>`
      );
    default:
      return `<rect x="0" y="0" width="200" height="230" fill="${a}"/>`;
  }
}

function variationRegions(field: Field, defs: Defs): string {
  // Imported tiling variation: register a pattern of the art and fill the field.
  const v = field.variation;
  if (v) {
    const art = getVariationAsset(v);
    if (art) {
      const tileW = 40;
      const tileH = art.w > 0 ? 40 * (art.h / art.w) : 40;
      const id = `hw-var-${v.replace(/[^A-Za-z0-9]+/g, '-')}-${defs.uid}`;
      if (!defs.patterns.has(id)) {
        const s = tileW / (art.w || 1);
        defs.patterns.set(
          id,
          `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${FIELD_BOUNDS.x0}" y="${FIELD_BOUNDS.y0}"` +
            ` width="${n(tileW)}" height="${n(tileH)}"><g transform="scale(${n(s)})">${art.inner}</g></pattern>`,
        );
      }
      return `<rect x="0" y="0" width="200" height="230" fill="url(#${id})"/>`;
    }
  }
  const a = paint(field.tinctures[0], defs);
  const b = paint(field.tinctures[1] ?? field.tinctures[0], defs);
  let out = `<rect x="0" y="0" width="200" height="230" fill="${b}"/>`;
  if (field.variation === 'barry') {
    const bars = 6;
    const h = 230 / bars;
    for (let i = 0; i < bars; i++) {
      if (i % 2 === 0) {
        out += `<rect x="0" y="${n(i * h)}" width="200" height="${n(h + 0.5)}" fill="${a}"/>`;
      }
    }
  } else if (field.variation === 'paly') {
    const pales = 6;
    const w = 200 / pales;
    for (let i = 0; i < pales; i++) {
      if (i % 2 === 0) {
        out += `<rect x="${n(i * w)}" y="0" width="${n(w + 0.5)}" height="230" fill="${a}"/>`;
      }
    }
  } else {
    // checky
    const cols = 5;
    const rows = 6;
    const w = 200 / cols;
    const h = 230 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) {
          out += `<rect x="${n(c * w)}" y="${n(r * h)}" width="${n(w + 0.5)}" height="${n(h + 0.5)}" fill="${a}"/>`;
        }
      }
    }
  }
  return out;
}

function fieldMarkup(field: Field, defs: Defs): string {
  if (field.mode === 'plain') {
    return `<rect x="0" y="0" width="200" height="230" fill="${paint(field.tinctures[0], defs)}"/>`;
  }
  if (field.mode === 'image') {
    const art = field.image ? getFieldAsset(field.image) : undefined;
    if (!art) return `<rect x="0" y="0" width="200" height="230" fill="${paint(field.tinctures[0], defs)}"/>`;
    const box = {
      x: FIELD_BOUNDS.x0, y: FIELD_BOUNDS.y0,
      w: FIELD_BOUNDS.x1 - FIELD_BOUNDS.x0, h: FIELD_BOUNDS.y1 - FIELD_BOUNDS.y0,
    };
    const t = fitTransform({ x: 0, y: 0, w: art.w, h: art.h }, box, 'cover');
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const k = field.scale && field.scale > 0 ? field.scale : 1;
    const dx = field.offsetX ? (field.offsetX / 100) * box.w : 0;
    const dy = field.offsetY ? (field.offsetY / 100) * box.h : 0;
    const adjust = k === 1 && !dx && !dy
      ? ''
      : `translate(${n(dx)} ${n(dy)}) translate(${n(cx)} ${n(cy)}) scale(${n(k)}) translate(${n(-cx)} ${n(-cy)}) `;
    let body: string;
    if (field.keepColour === false) {
      const fill = hexOf(field.tinctures[0]);
      body = `<g fill="${fill}" stroke="${fill}">${stripColours(art.inner)}</g>`;
    } else if (field.colourMap && Object.keys(field.colourMap).length) {
      body = applyColourMap(art.inner, field.colourMap);
    } else {
      body = art.inner;
    }
    const bg = field.bg
      ? `<rect x="0" y="0" width="200" height="230" fill="${paint(field.bg, defs)}"/>`
      : '';
    return `${bg}<g transform="${adjust}${t}">${body}</g>`;
  }
  if (field.mode === 'division') return divisionRegions(field, defs);
  return variationRegions(field, defs);
}

// --- ordinaries ---------------------------------------------------------------

function ordinaryMarkup(o: Ordinary): string {
  const f = hexOf(o.tincture);
  switch (o.type) {
    case 'chief':
      return `<rect x="0" y="16" width="200" height="42" fill="${f}"/>`;
    case 'pale':
      return `<rect x="77" y="0" width="46" height="230" fill="${f}"/>`;
    case 'fess':
      return `<rect x="0" y="92" width="200" height="46" fill="${f}"/>`;
    case 'bend':
      return `<polygon points="-16.33,4.45 16.33,-21.95 216.33,225.55 183.67,251.95" fill="${f}"/>`;
    case 'bend-sinister':
      return `<polygon points="16.34,251.95 -16.34,225.55 183.66,-21.95 216.34,4.45" fill="${f}"/>`;
    case 'chevron':
      return `<polyline points="20,200 100,95 180,200" fill="none" stroke="${f}" stroke-width="34" stroke-linejoin="miter"/>`;
    case 'cross':
      return (
        `<rect x="78" y="0" width="44" height="230" fill="${f}"/>` +
        `<rect x="0" y="93" width="200" height="44" fill="${f}"/>`
      );
    case 'saltire':
      return (
        `<line x1="20" y1="16" x2="180" y2="214" stroke="${f}" stroke-width="30"/>` +
        `<line x1="180" y1="16" x2="20" y2="214" stroke="${f}" stroke-width="30"/>`
      );
    case 'pile':
      return `<polygon points="20,16 180,16 100,180" fill="${f}"/>`;
    default: {
      // Imported ordinary: a recolourable shape fitted to the field box, then
      // scaled about the shield centre (so it grows/shrinks evenly both ways).
      const def = getOrdinaryAsset(o.type);
      if (!def) return '';
      const box = {
        x: FIELD_BOUNDS.x0, y: FIELD_BOUNDS.y0,
        w: FIELD_BOUNDS.x1 - FIELD_BOUNDS.x0, h: FIELD_BOUNDS.y1 - FIELD_BOUNDS.y0,
      };
      const fit = fitTransform({ x: 0, y: 0, w: 100, h: 100 }, box, 'contain');
      const k = o.scale && o.scale > 0 ? o.scale : 1;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const grow = k === 1 ? '' : `translate(${n(cx)} ${n(cy)}) scale(${n(k)}) translate(${n(-cx)} ${n(-cy)}) `;
      const dx = o.offsetX ? (o.offsetX / 100) * box.w : 0;
      const shift = dx ? `translate(${n(dx)} 0) ` : '';
      const body = def.render(f, { keepColour: o.keepColour, colourMap: o.colourMap });
      return `<g transform="${shift}${grow}${fit}">${body}</g>`;
    }
  }
}

// --- charges ------------------------------------------------------------------

interface Pos {
  x: number;
  y: number;
  size: number;
}

/** Anchor centre for each of the 9 placement positions. */
const ANCHORS: Record<Position, { x: number; y: number }> = {
  'top-left': { x: 62, y: 50 },
  top: { x: 100, y: 46 },
  'top-right': { x: 138, y: 50 },
  left: { x: 56, y: 116 },
  center: { x: 100, y: 118 },
  right: { x: 144, y: 116 },
  'bottom-left': { x: 64, y: 172 },
  bottom: { x: 100, y: 184 },
  'bottom-right': { x: 136, y: 172 },
};

/** A small row of up to 3 charges centred on (cx, cy). */
function rowAround(cx: number, cy: number, count: number, size: number): Pos[] {
  if (count <= 1) return [{ x: cx, y: cy, size }];
  if (count === 2) {
    const s = size - 4;
    return [
      { x: cx - 22, y: cy, size: s },
      { x: cx + 22, y: cy, size: s },
    ];
  }
  const s = size - 10;
  return [
    { x: cx - 30, y: cy, size: s },
    { x: cx, y: cy, size: s },
    { x: cx + 30, y: cy, size: s },
  ];
}

function chargePositions(count: number, arrangement: Arrangement, position: Position): Pos[] {
  if (position === 'center') {
    // Centre keeps the richer field layouts (single, fess, pale, two-and-one).
    if (count === 1 || arrangement === 'one') return [{ x: 100, y: 118, size: 78 }];
    if (arrangement === 'in-pale')
      return [
        { x: 100, y: 78, size: 58 },
        { x: 100, y: 150, size: 58 },
      ];
    if (arrangement === 'in-fess')
      return [
        { x: 66, y: 112, size: 62 },
        { x: 134, y: 112, size: 62 },
      ];
    // two-and-one
    return [
      { x: 66, y: 74, size: 54 },
      { x: 134, y: 74, size: 54 },
      { x: 100, y: 150, size: 54 },
    ];
  }
  const a = ANCHORS[position];
  return rowAround(a.x, a.y, count, 48);
}

/** Charge layout for flags: centred and spread to fill the (w, h) rectangle,
 *  sized to the flag's height. Kept separate from the shield layout so charges
 *  stay undistorted while the field/ordinary scale to the flag. */
function flagChargePositions(count: number, arrangement: Arrangement, position: Position, w: number, h: number): Pos[] {
  const cx = w / 2;
  const cy = h / 2;
  if (position === 'center') {
    if (count === 1 || arrangement === 'one') return [{ x: cx, y: cy, size: h * 0.52 }];
    if (arrangement === 'in-pale')
      return [
        { x: cx, y: cy - h * 0.22, size: h * 0.38 },
        { x: cx, y: cy + h * 0.22, size: h * 0.38 },
      ];
    if (arrangement === 'in-fess')
      return [
        { x: cx - w * 0.18, y: cy, size: h * 0.4 },
        { x: cx + w * 0.18, y: cy, size: h * 0.4 },
      ];
    return [
      { x: cx - w * 0.16, y: cy - h * 0.16, size: h * 0.34 },
      { x: cx + w * 0.16, y: cy - h * 0.16, size: h * 0.34 },
      { x: cx, y: cy + h * 0.2, size: h * 0.34 },
    ];
  }
  const frac: Record<Position, [number, number]> = {
    'top-left': [0.28, 0.28], top: [0.5, 0.26], 'top-right': [0.72, 0.28],
    left: [0.26, 0.5], center: [0.5, 0.5], right: [0.74, 0.5],
    'bottom-left': [0.28, 0.72], bottom: [0.5, 0.74], 'bottom-right': [0.72, 0.72],
  };
  const [fx, fy] = frac[position];
  const ax = fx * w;
  const ay = fy * h;
  const s = h * 0.3;
  if (count <= 1) return [{ x: ax, y: ay, size: s }];
  if (count === 2) return [{ x: ax - w * 0.08, y: ay, size: s - 6 }, { x: ax + w * 0.08, y: ay, size: s - 6 }];
  return [
    { x: ax - w * 0.1, y: ay, size: s - 12 },
    { x: ax, y: ay, size: s - 12 },
    { x: ax + w * 0.1, y: ay, size: s - 12 },
  ];
}

function chargeGroupMarkup(g: ChargeGroup, flag: FlagFrame | null): string {
  const def = getCharge(g.charge);
  if (!def) return '';
  const fill = hexOf(g.tincture);
  const inner = def.render(fill, { keepColour: g.keepColour, colourMap: g.colourMap });
  const mult = g.scale && g.scale > 0 ? g.scale : 1;
  const positions = flag
    ? flagChargePositions(g.count, g.arrangement, positionOf(g), flag.w, flag.h)
    : chargePositions(g.count, g.arrangement, positionOf(g));
  return positions
    .slice(0, g.count)
    .map((p) => {
      const scale = (p.size * mult) / 100;
      // Rotate each charge about its own centre (p.x, p.y), applied before the
      // placement so the centre stays put regardless of mirroring.
      const rot = g.rotate ? `rotate(${n(g.rotate)} ${n(p.x)} ${n(p.y)}) ` : '';
      if (!g.flipX && !g.flipY) {
        const tx = p.x - 50 * scale;
        const ty = p.y - 50 * scale;
        return `<g transform="${rot}translate(${n(tx)},${n(ty)}) scale(${n(scale)})">${inner}</g>`;
      }
      // Mirror about the charge centre by negating the axis scale and shifting
      // the origin to the opposite edge, so the centre stays put.
      const sx = (g.flipX ? -1 : 1) * scale;
      const sy = (g.flipY ? -1 : 1) * scale;
      const tx = p.x - 50 * sx;
      const ty = p.y - 50 * sy;
      return `<g transform="${rot}translate(${n(tx)},${n(ty)}) scale(${n(sx)},${n(sy)})">${inner}</g>`;
    })
    .join('');
}

// --- top-level ----------------------------------------------------------------

/** Render a spec to a standalone, self-contained SVG string. */
export function renderSvg(spec: Spec, opts: RenderOptions = {}): string {
  const outline = opts.outline ?? '#20201e';
  // Append a process-global counter so two shields that share a uid (e.g. the
  // same note-title key rendered as both an inline and a block, or the same
  // note open in two panes) never collide on clipPath / pattern ids — an
  // SVG url(#id) reference resolves to the first match in the document, so a
  // collision would make one shield borrow another's clip or fill.
  const safe = `${safeId(opts.uid ?? 'hw')}-${counter++}`;
  const clipId = `hw-clip-${safe}`;

  const isFlag = spec.format === 'flag';
  const frame = isFlag ? flagFrame(spec.flag ?? 'flag') : null;
  const W = frame ? frame.w : SHIELD_W;
  const H = frame ? frame.h : SHIELD_H;

  // Resolve the outline (clip region + border stroke).
  let clipChild: string;
  let border: string;
  if (frame) {
    clipChild = `<path d="${frame.clip}"/>`;
    border = `<path d="${frame.clip}" fill="none" stroke="${outline}" stroke-width="2"/>`;
  } else {
    const builtin = builtinShieldPath(spec.shield);
    if (builtin) {
      clipChild = `<path d="${builtin}"/>`;
      border = `<path d="${builtin}" fill="none" stroke="${outline}" stroke-width="2"/>`;
    } else {
      const sh = getShieldAsset(spec.shield);
      const box = {
        x: FIELD_BOUNDS.x0, y: FIELD_BOUNDS.y0,
        w: FIELD_BOUNDS.x1 - FIELD_BOUNDS.x0, h: FIELD_BOUNDS.y1 - FIELD_BOUNDS.y0,
      };
      if (sh) {
        const t = fitTransform({ x: 0, y: 0, w: sh.w, h: sh.h }, box, 'contain');
        clipChild = `<path d="${sh.d}" transform="${t}"/>`;
        border = `<path d="${sh.d}" transform="${t}" fill="none" stroke="${outline}" stroke-width="2"/>`;
      } else {
        const h = shieldPath('heater');
        clipChild = `<path d="${h}"/>`;
        border = `<path d="${h}" fill="none" stroke="${outline}" stroke-width="2"/>`;
      }
    }
  }
  const defs: Defs = { uid: safe, patterns: new Map() };

  const inner = fieldMarkup(spec.field, defs) +
    (spec.ordinary ? ordinaryMarkup(spec.ordinary) : '');
  // The field+ordinary are authored in 200x230 design space; for a flag we
  // scale that composition into the frame (full-width fess, corner-to-corner
  // saltire, etc.). Shields render it 1:1.
  const clipped = frame
    ? `<g transform="scale(${n(W / SHIELD_W)} ${n(H / SHIELD_H)})">${inner}</g>`
    : inner;

  // Charges are sized to sit inside the field, so they are not clipped (keeps
  // their outlines crisp at the edge) and are placed undistorted.
  const charges = spec.charges.map((g) => chargeGroupMarkup(g, frame)).join('');

  const patternDefs = [...defs.patterns.values()].join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">` +
    `<defs><clipPath id="${clipId}">${clipChild}</clipPath>${patternDefs}</defs>` +
    `<g clip-path="url(#${clipId})">${clipped}</g>` +
    charges +
    border +
    `</svg>`
  );
}
