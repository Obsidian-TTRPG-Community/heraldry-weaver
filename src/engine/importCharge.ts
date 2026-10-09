import type { ChargeDef } from './charges';
import { svgBox } from './svgGeometry';

// Convert an arbitrary SVG string into a ChargeDef that fits the canonical
// 100x100 charge box. Pure and testable; the plugin layer reads files and feeds
// their contents here.

function round(v: number): number {
  return Number(v.toFixed(3));
}

/** Root user-space box (viewBox, else width/height in px, else 100x100). */
export function parseViewBox(svg: string): { x: number; y: number; w: number; h: number } {
  return svgBox(svg);
}

export function innerOf(svg: string): string {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return (m ? m[1] : svg).trim();
}

/** Remove explicit fill/stroke colours (keeping `none`) so a group fill applies. */
export function stripColours(inner: string): string {
  return inner.replace(/\s(fill|stroke)\s*=\s*"(?!none")[^"]*"/gi, '');
}

/** Distinct fill/stroke colours used in the markup (lower-cased, sans none). */
export function extractPalette(inner: string): string[] {
  const set = new Set<string>();
  const re = /\b(?:fill|stroke)\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const v = m[1].trim().toLowerCase();
    if (v && v !== 'none' && v !== 'transparent') set.add(v);
  }
  return [...set];
}

/** Replace specific fill/stroke colours per `map` (keys lower-cased); others kept. */
export function applyColourMap(inner: string, map: Record<string, string>): string {
  return inner.replace(/\b(fill|stroke)(\s*=\s*)"([^"]+)"/gi, (full, attr, eq, val) => {
    const mapped = map[String(val).trim().toLowerCase()];
    return mapped ? `${attr}${eq}"${mapped}"` : full;
  });
}

export interface ImportOptions {
  /** Recolour the charge to the chosen tincture (treat as a silhouette). */
  recolor?: boolean;
  label?: string;
  /** Explicit plural for blazon (defaults to label + "s"). */
  plural?: string;
  article?: 'a' | 'an';
  /** Picker grouping label (e.g. the source subfolder path). */
  category?: string;
}

export function chargeFromSvg(
  id: string,
  svg: string,
  opts: ImportOptions = {},
): ChargeDef {
  const { x, y, w, h } = parseViewBox(svg);
  const inner = innerOf(svg);
  const defaultRecolor = opts.recolor ?? true;
  const max = Math.max(w, h) || 100;
  const scale = 100 / max;
  // Centre the viewBox in the 100x100 box, honouring a non-zero origin.
  const tx = (100 - w * scale) / 2 - x * scale;
  const ty = (100 - h * scale) / 2 - y * scale;
  const transform = `translate(${round(tx)},${round(ty)}) scale(${round(scale)})`;
  const label = opts.label ?? id;

  return {
    id,
    singular: label,
    plural: opts.plural ?? `${label}s`,
    article: opts.article ?? 'a',
    category: opts.category,
    palette: extractPalette(inner),
    render: (fill: string, ropts?: { keepColour?: boolean; colourMap?: Record<string, string> }) => {
      // Per-instance keepColour wins; otherwise fall back to the import default
      // (i.e. the global "recolour imported charges" setting at load time).
      const keep = ropts?.keepColour ?? !defaultRecolor;
      let body: string;
      if (!keep) {
        body = `<g fill="${fill}" stroke="${fill}">${stripColours(inner)}</g>`;
      } else if (ropts?.colourMap && Object.keys(ropts.colourMap).length) {
        body = applyColourMap(inner, ropts.colourMap); // remap chosen colours, keep the rest
      } else {
        body = inner;
      }
      return `<g transform="${transform}">${body}</g>`;
    },
  };
}
