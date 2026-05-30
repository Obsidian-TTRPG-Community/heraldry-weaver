import type { ChargeDef } from './charges';

// Convert an arbitrary SVG string into a ChargeDef that fits the canonical
// 100x100 charge box. Pure and testable; the plugin layer reads files and feeds
// their contents here.

function round(v: number): number {
  return Number(v.toFixed(3));
}

function parseViewBox(svg: string): { w: number; h: number } {
  const vb = svg.match(/viewBox\s*=\s*"([-\d.\s,]+)"/i);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] };
  }
  const w = svg.match(/\bwidth\s*=\s*"([\d.]+)/i);
  const h = svg.match(/\bheight\s*=\s*"([\d.]+)/i);
  return {
    w: w ? Number(w[1]) : 100,
    h: h ? Number(h[1]) : 100,
  };
}

function innerOf(svg: string): string {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return (m ? m[1] : svg).trim();
}

/** Remove explicit fill/stroke colours (keeping `none`) so a group fill applies. */
export function stripColours(inner: string): string {
  return inner.replace(/\s(fill|stroke)\s*=\s*"(?!none")[^"]*"/gi, '');
}

export interface ImportOptions {
  /** Recolour the charge to the chosen tincture (treat as a silhouette). */
  recolor?: boolean;
  label?: string;
  article?: 'a' | 'an';
}

export function chargeFromSvg(
  id: string,
  svg: string,
  opts: ImportOptions = {},
): ChargeDef {
  const { w, h } = parseViewBox(svg);
  const inner = innerOf(svg);
  const recolor = opts.recolor ?? true;
  const max = Math.max(w, h) || 100;
  const scale = 100 / max;
  const tx = (100 - w * scale) / 2;
  const ty = (100 - h * scale) / 2;
  const transform = `translate(${round(tx)},${round(ty)}) scale(${round(scale)})`;
  const label = opts.label ?? id;

  return {
    id,
    singular: label,
    plural: `${label}s`,
    article: opts.article ?? 'a',
    render: (fill: string) => {
      const body = recolor
        ? `<g fill="${fill}" stroke="${fill}">${stripColours(inner)}</g>`
        : inner;
      return `<g transform="${transform}">${body}</g>`;
    },
  };
}
