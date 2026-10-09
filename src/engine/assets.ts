// Registries and SVG builders for user-imported NON-charge elements: ordinaries
// (recolourable shapes drawn in the ordinary layer), shields (escutcheon
// outlines used as clip + border), fields (full-bleed background art) and
// variations (tiling patterns). Charges live in charges.ts; these mirror its
// pattern so the plugin layer can register, clear, look up and group them.

import type { ChargeDef } from './charges';
import { chargeFromSvg, innerOf, extractPalette, type ImportOptions } from './importCharge';
import type { CustomFur } from './tinctures';
import { svgBox, flattenGeometry } from './svgGeometry';

export interface ImportedShield {
  id: string;
  label: string;
  category?: string;
  /** Combined outline geometry (transforms baked in) in the art's user space. */
  d: string;
  /** The outline's own bounds in that space — the box the renderer fits. */
  x?: number;
  y?: number;
  w: number;
  h: number;
}

export interface ImportedArt {
  id: string;
  label: string;
  category?: string;
  /** Inner SVG markup in the art's own user space. */
  inner: string;
  /** The art's viewBox (origin may be non-zero). */
  x?: number;
  y?: number;
  w: number;
  h: number;
  /** Distinct fill/stroke colours in the art, for the colour editor. */
  palette: string[];
}

// --- generic helpers ----------------------------------------------------------

/** Root user-space box of an SVG string: viewBox (either quote style), else
 *  width/height in px, else 0,0,100,100. */
export function viewBoxOf(svg: string): { x: number; y: number; w: number; h: number } {
  return svgBox(svg);
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

/** Exact bounding box of the drawn geometry in the root user space — nested
 *  transforms applied, relative path commands and arcs understood. Null if
 *  there is no measurable geometry. */
export function inkBounds(inner: string): { x: number; y: number; w: number; h: number } | null {
  return flattenGeometry(inner).bounds;
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
  // Bake every transform into one absolute outline and fit the outline's own
  // bounds, so page padding, layer offsets and unit scaling in the source file
  // cannot shift or shrink the shield.
  const g = flattenGeometry(innerOf(svg));
  if (!g.d || !g.bounds) return null;
  const b = g.bounds;
  return { id, label: opts.label ?? id, category: opts.category, d: g.d, x: b.x, y: b.y, w: b.w, h: b.h };
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
  return { id, label: opts.label ?? id, category: opts.category, inner, x: vb.x, y: vb.y, w: vb.w, h: vb.h, palette: extractPalette(inner) };
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
  return { id, label: opts.label ?? id, category: opts.category, inner, x: vb.x, y: vb.y, w: vb.w, h: vb.h, palette: extractPalette(inner) };
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
  return { id, label: opts.label ?? id, category: opts.category, inner, x: vb.x, y: vb.y, w: vb.w, h: vb.h, palette: extractPalette(inner) };
}
