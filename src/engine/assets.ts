// Registries and SVG builders for user-imported NON-charge elements: ordinaries
// (recolourable shapes drawn in the ordinary layer), shields (escutcheon
// outlines used as clip + border), fields (full-bleed background art) and
// variations (tiling patterns). Charges live in charges.ts; these mirror its
// pattern so the plugin layer can register, clear, look up and group them.

import type { ChargeDef } from './charges';
import { chargeFromSvg, innerOf, extractPalette, type ImportOptions } from './importCharge';
import type { CustomFur } from './tinctures';

export interface ImportedShield {
  id: string;
  label: string;
  category?: string;
  /** Combined outline geometry in the art's own (0,0-origin) coordinates. */
  d: string;
  w: number;
  h: number;
}

export interface ImportedArt {
  id: string;
  label: string;
  category?: string;
  /** Inner SVG markup in the art's own (0,0-origin) coordinates. */
  inner: string;
  w: number;
  h: number;
  /** Distinct fill/stroke colours in the art, for the colour editor. */
  palette: string[];
}

// --- generic helpers ----------------------------------------------------------

/** Full viewBox of an SVG string (origin + size); falls back to 0,0,100,100. */
export function viewBoxOf(svg: string): { x: number; y: number; w: number; h: number } {
  const vb = svg.match(/viewBox\s*=\s*"([-\d.\s,]+)"/i);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  return { x: 0, y: 0, w: 100, h: 100 };
}

/** Transform fitting an art box into a target box, preserving aspect.
 *  'contain' fits inside (letterboxed); 'cover' fills (cropped). */
export function fitTransform(
  art: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
  mode: 'contain' | 'cover' = 'contain',
): string {
  const sx = box.w / art.w;
  const sy = box.h / art.h;
  const s = mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const tx = box.x - art.x * s + (box.w - art.w * s) / 2;
  const ty = box.y - art.y * s + (box.h - art.h * s) / 2;
  const r = (v: number) => Number(v.toFixed(3));
  return `translate(${r(tx)} ${r(ty)}) scale(${r(s)})`;
}

function groupBy<T extends { category?: string }>(
  reg: Record<string, T>,
): { label: string; ids: string[] }[] {
  const byCat = new Map<string, string[]>();
  for (const id of Object.keys(reg)) {
    const raw = reg[id].category?.trim();
    const cat = raw && raw.length ? raw : 'Imported';
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(id);
  }
  return [...byCat.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, ids: byCat.get(label)! }));
}

/** Extract combined outline geometry (paths + polygons) as a single `d`. */
function geometryD(inner: string): string {
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  const pathRe = /<path\b[^>]*\bd\s*=\s*"([^"]+)"/gi;
  while ((m = pathRe.exec(inner))) parts.push(m[1].trim());
  const polyRe = /<polygon\b[^>]*\bpoints\s*=\s*"([^"]+)"/gi;
  while ((m = polyRe.exec(inner))) {
    const pts = m[1].trim().split(/\s+/);
    if (pts.length) parts.push('M' + pts.join(' L') + ' Z');
  }
  return parts.join(' ');
}

/** Tight bounding box of the actual drawn geometry (a superset for curves;
 *  exact for the straight-line art typical of ordinaries). Null if none. */
export function inkBounds(inner: string): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x: number, y: number): void => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  const pairs = (s: string): void => {
    const nums = s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) ext(nums[i], nums[i + 1]);
  };
  const attr = (tag: string, k: string): number => {
    const r = tag.match(new RegExp(`\\b${k}\\s*=\\s*"(-?[\\d.]+)`));
    return r ? Number(r[1]) : NaN;
  };
  let m: RegExpExecArray | null;
  const dRe = /<path\b[^>]*\bd\s*=\s*"([^"]+)"/gi;
  while ((m = dRe.exec(inner))) pairs(m[1]);
  const pRe = /<(?:polygon|polyline)\b[^>]*\bpoints\s*=\s*"([^"]+)"/gi;
  while ((m = pRe.exec(inner))) pairs(m[1]);
  const rRe = /<rect\b[^>]*>/gi;
  while ((m = rRe.exec(inner))) {
    const t = m[0], x = attr(t, 'x') || 0, y = attr(t, 'y') || 0, w = attr(t, 'width'), h = attr(t, 'height');
    if (isFinite(w) && isFinite(h)) { ext(x, y); ext(x + w, y + h); }
  }
  const cRe = /<circle\b[^>]*>/gi;
  while ((m = cRe.exec(inner))) {
    const t = m[0], cx = attr(t, 'cx') || 0, cy = attr(t, 'cy') || 0, r = attr(t, 'r');
    if (isFinite(r)) { ext(cx - r, cy - r); ext(cx + r, cy + r); }
  }
  const eRe = /<ellipse\b[^>]*>/gi;
  while ((m = eRe.exec(inner))) {
    const t = m[0], cx = attr(t, 'cx') || 0, cy = attr(t, 'cy') || 0, rx = attr(t, 'rx'), ry = attr(t, 'ry');
    if (isFinite(rx) && isFinite(ry)) { ext(cx - rx, cy - ry); ext(cx + rx, cy + ry); }
  }
  const lRe = /<line\b[^>]*>/gi;
  while ((m = lRe.exec(inner))) {
    const t = m[0];
    ext(attr(t, 'x1'), attr(t, 'y1'));
    ext(attr(t, 'x2'), attr(t, 'y2'));
  }
  if (!isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Re-crop an SVG to its actual ink, at a (0,0) origin, so downstream fitters
 *  centre on the artwork itself rather than on any padding in its canvas. */
export function cropToInk(svg: string): string {
  const inner = innerOf(svg);
  const b = inkBounds(inner);
  if (!b) return svg;
  const r = (v: number) => Number(v.toFixed(3));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(b.w)} ${r(b.h)}">` +
    `<g transform="translate(${r(-b.x)} ${r(-b.y)})">${inner}</g></svg>`;
}

// --- ordinaries (reuse the recolourable ChargeDef shape) ----------------------

const ordinaries: Record<string, ChargeDef> = {};
export function registerOrdinaryAsset(def: ChargeDef): void { ordinaries[def.id] = def; }
export function clearOrdinaryAssets(): void { for (const k of Object.keys(ordinaries)) delete ordinaries[k]; }
export function getOrdinaryAsset(id: string): ChargeDef | undefined { return ordinaries[id]; }
export function isImportedOrdinary(id: string): boolean { return id in ordinaries; }
export function ordinaryAssetGroups(): { label: string; ids: string[] }[] { return groupBy(ordinaries); }
export function ordinaryFromSvg(id: string, svg: string, opts: ImportOptions = {}): ChargeDef {
  // Crop to the artwork's ink so it centres on the shield and spans the field
  // box at 1x regardless of any padding baked into the source canvas.
  return chargeFromSvg(id, cropToInk(svg), opts);
}

// --- shields ------------------------------------------------------------------

const shields: Record<string, ImportedShield> = {};
export function registerShieldAsset(s: ImportedShield): void { shields[s.id] = s; }
export function clearShieldAssets(): void { for (const k of Object.keys(shields)) delete shields[k]; }
export function getShieldAsset(id: string): ImportedShield | undefined { return shields[id]; }
export function isImportedShield(id: string): boolean { return id in shields; }
export function shieldAssetGroups(): { label: string; ids: string[] }[] { return groupBy(shields); }
export function shieldFromSvg(id: string, svg: string, opts: { label?: string; category?: string } = {}): ImportedShield | null {
  const d = geometryD(innerOf(svg));
  if (!d) return null;
  const vb = viewBoxOf(svg);
  return { id, label: opts.label ?? id, category: opts.category, d, w: vb.w, h: vb.h };
}

// --- fields (background art) --------------------------------------------------

const fields: Record<string, ImportedArt> = {};
export function registerFieldAsset(a: ImportedArt): void { fields[a.id] = a; }
export function clearFieldAssets(): void { for (const k of Object.keys(fields)) delete fields[k]; }
export function getFieldAsset(id: string): ImportedArt | undefined { return fields[id]; }
export function isImportedField(id: string): boolean { return id in fields; }
export function fieldAssetGroups(): { label: string; ids: string[] }[] { return groupBy(fields); }
export function fieldFromSvg(id: string, svg: string, opts: { label?: string; category?: string } = {}): ImportedArt {
  const vb = viewBoxOf(svg);
  const inner = innerOf(svg);
  return { id, label: opts.label ?? id, category: opts.category, inner, w: vb.w, h: vb.h, palette: extractPalette(inner) };
}

// --- variations (tiling patterns) --------------------------------------------

const variations: Record<string, ImportedArt> = {};
export function registerVariationAsset(a: ImportedArt): void { variations[a.id] = a; }
export function clearVariationAssets(): void { for (const k of Object.keys(variations)) delete variations[k]; }
export function getVariationAsset(id: string): ImportedArt | undefined { return variations[id]; }
export function isImportedVariation(id: string): boolean { return id in variations; }
export function variationAssetGroups(): { label: string; ids: string[] }[] { return groupBy(variations); }
export function variationFromSvg(id: string, svg: string, opts: { label?: string; category?: string } = {}): ImportedArt {
  const vb = viewBoxOf(svg);
  const inner = innerOf(svg);
  return { id, label: opts.label ?? id, category: opts.category, inner, w: vb.w, h: vb.h, palette: extractPalette(inner) };
}

/** Clear every imported non-charge asset (charges are cleared separately). */
export function clearAllAssets(): void {
  clearOrdinaryAssets();
  clearShieldAssets();
  clearFieldAssets();
  clearVariationAssets();
}

/** Flat id lists, used by the random generator when custom rolls are enabled. */
export function listOrdinaryAssetIds(): string[] { return Object.keys(ordinaries); }
export function listShieldAssetIds(): string[] { return Object.keys(shields); }
export function listFieldAssetIds(): string[] { return Object.keys(fields); }
export function listVariationAssetIds(): string[] { return Object.keys(variations); }

// --- custom furs (built here, registered into the tincture layer) -------------

/** Build a CustomFur (a pre-tiled semé sheet used as a cover-filled tincture). */
export function furFromSvg(id: string, svg: string, opts: { label?: string; category?: string } = {}): CustomFur {
  const vb = viewBoxOf(svg);
  const inner = innerOf(svg);
  return { id, label: opts.label ?? id, category: opts.category, inner, w: vb.w, h: vb.h, palette: extractPalette(inner) };
}
