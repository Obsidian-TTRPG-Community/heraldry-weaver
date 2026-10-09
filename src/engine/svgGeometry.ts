// Pure SVG geometry helpers for the import pipeline. Imported art arrives from
// arbitrary editors (Inkscape, Illustrator, Affinity, WMF conversion), and the
// fitters need to know where the artwork really is. That means honouring the
// root viewBox origin and units, every nested `transform`, and the full path
// grammar (relative commands, H/V, S/T shorthands, arcs). No DOM: this runs in
// node tests as well as in Obsidian.

export interface Box { x: number; y: number; w: number; h: number }

/** Affine matrix [a b c d e f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 · m2 — the result applies m2 first, then m1. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const NUM_G = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
function numbers(s: string): number[] {
  return (s.match(NUM_G) ?? []).map(Number);
}

/** Parse an SVG `transform` attribute (any sequence of the six functions). */
export function parseTransform(src: string | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!src) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let f: RegExpExecArray | null;
  while ((f = re.exec(src))) {
    const a = numbers(f[2]);
    let t: Matrix = IDENTITY;
    switch (f[1].toLowerCase()) {
      case 'matrix':
        if (a.length === 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(r), sin = Math.sin(r);
        t = [cos, sin, -sin, cos, 0, 0];
        if (a.length >= 3) {
          t = multiply(multiply([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        }
        break;
      }
      case 'skewx':
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewy':
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

// --- root box -----------------------------------------------------------------

const UNIT_PX: Record<string, number> = {
  '': 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16,
};

function attrOf(attrs: string, name: string): string | undefined {
  const r = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return r ? (r[1] ?? r[2]) : undefined;
}

/** Length attribute in px, or NaN for missing / percentage / unknown units. */
function lengthPx(v: string | undefined): number {
  if (!v) return NaN;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-z]*)\s*$/i.exec(v);
  if (!m) return NaN;
  const k = UNIT_PX[m[2].toLowerCase()];
  return k === undefined ? NaN : Number(m[1]) * k;
}

/**
 * The root `<svg>` user-space box: the viewBox (either quote style), else the
 * width/height converted to px (user units are px when there is no viewBox),
 * else 0,0,100,100.
 */
export function svgBox(svg: string): Box {
  const tag = /<svg\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i.exec(svg);
  const attrs = tag ? tag[1] : '';
  const vb = attrOf(attrs, 'viewBox');
  if (vb) {
    const p = numbers(vb);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  const w = lengthPx(attrOf(attrs, 'width'));
  const h = lengthPx(attrOf(attrs, 'height'));
  return { x: 0, y: 0, w: w > 0 ? w : 100, h: h > 0 ? h : 100 };
}

// --- path data ----------------------------------------------------------------

/** Absolute segments: M/L carry one point, C three, Z none. */
export type Seg =
  | { c: 'M' | 'L'; p: [number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Z' };

function arcToCubics(
  x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number,
  large: boolean, sweep: boolean, x2: number, y2: number,
): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry) return [{ c: 'L', p: [x2, y2] }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, den ? num / den : 0));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
  const th1 = ang(1, 0, ux, uy);
  let dth = ang(ux, uy, vx, vy);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const delta = dth / n;
  const t = (4 / 3) * Math.tan(delta / 4);
  const map = (px: number, py: number): [number, number] =>
    [cx + rx * px * cos - ry * py * sin, cy + rx * px * sin + ry * py * cos];
  const out: Seg[] = [];
  for (let k = 0; k < n; k++) {
    const a1 = th1 + k * delta, a2 = a1 + delta;
    const c1 = map(Math.cos(a1) - t * Math.sin(a1), Math.sin(a1) + t * Math.cos(a1));
    const c2 = map(Math.cos(a2) + t * Math.sin(a2), Math.sin(a2) - t * Math.cos(a2));
    const e = k === n - 1 ? [x2, y2] : map(Math.cos(a2), Math.sin(a2));
    out.push({ c: 'C', p: [c1[0], c1[1], c2[0], c2[1], e[0], e[1]] });
  }
  return out;
}

/** Parse path data into absolute M/L/C/Z segments. Stops quietly at the first
 *  malformed token, keeping what parsed (as browsers render up to the error). */
export function parsePath(d: string): Seg[] {
  const segs: Seg[] = [];
  const n = d.length;
  let i = 0;
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const skip = (): void => { while (i < n && (d[i] === ',' || d[i] <= ' ')) i++; };
  const hasNum = (): boolean => { skip(); return i < n && /[-+.\d]/.test(d[i]); };
  const num = (): number => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) throw new Error('num');
    i = NUM.lastIndex;
    return Number(m[0]);
  };
  const flag = (): boolean => {
    skip();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') throw new Error('flag');
    i++;
    return ch === '1';
  };

  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lcx = 0, lcy = 0; // last cubic control (for S)
  let lqx = 0, lqy = 0; // last quadratic control (for T)
  let prev = '';
  try {
    for (;;) {
      skip();
      if (i >= n) break;
      if (/[A-Za-z]/.test(d[i])) {
        cmd = d[i++];
      } else if (!cmd || cmd === 'Z' || cmd === 'z' || !hasNum()) {
        break;
      }
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? cx : 0, oy = rel ? cy : 0;
      let kind = '';
      switch (cmd.toUpperCase()) {
        case 'M': {
          cx = ox + num(); cy = oy + num();
          sx = cx; sy = cy;
          segs.push({ c: 'M', p: [cx, cy] });
          cmd = rel ? 'l' : 'L'; // implicit repeats are lineto
          break;
        }
        case 'L':
          cx = ox + num(); cy = oy + num();
          segs.push({ c: 'L', p: [cx, cy] });
          break;
        case 'H':
          cx = ox + num();
          segs.push({ c: 'L', p: [cx, cy] });
          break;
        case 'V':
          cy = oy + num();
          segs.push({ c: 'L', p: [cx, cy] });
          break;
        case 'C': {
          const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
          cx = ox + num(); cy = oy + num();
          segs.push({ c: 'C', p: [x1, y1, x2, y2, cx, cy] });
          lcx = x2; lcy = y2; kind = 'C';
          break;
        }
        case 'S': {
          const x1 = prev === 'C' ? 2 * cx - lcx : cx;
          const y1 = prev === 'C' ? 2 * cy - lcy : cy;
          const x2 = ox + num(), y2 = oy + num();
          cx = ox + num(); cy = oy + num();
          segs.push({ c: 'C', p: [x1, y1, x2, y2, cx, cy] });
          lcx = x2; lcy = y2; kind = 'C';
          break;
        }
        case 'Q':
        case 'T': {
          let qx: number, qy: number;
          if (cmd.toUpperCase() === 'Q') { qx = ox + num(); qy = oy + num(); }
          else { qx = prev === 'Q' ? 2 * cx - lqx : cx; qy = prev === 'Q' ? 2 * cy - lqy : cy; }
          const ex = ox + num(), ey = oy + num();
          segs.push({
            c: 'C',
            p: [cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy),
              ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey],
          });
          cx = ex; cy = ey; lqx = qx; lqy = qy; kind = 'Q';
          break;
        }
        case 'A': {
          const rx = num(), ry = num(), rot = num();
          const large = flag(), sw = flag();
          const ex = ox + num(), ey = oy + num();
          segs.push(...arcToCubics(cx, cy, rx, ry, rot, large, sw, ex, ey));
          cx = ex; cy = ey;
          break;
        }
        case 'Z':
          segs.push({ c: 'Z' });
          cx = sx; cy = sy;
          break;
        default:
          throw new Error('cmd');
      }
      prev = kind;
    }
  } catch {
    // malformed tail — keep what parsed
  }
  return segs;
}

export function transformSegs(segs: Seg[], m: Matrix): Seg[] {
  if (m === IDENTITY) return segs;
  return segs.map((s): Seg => {
    if (s.c === 'Z') return s;
    if (s.c === 'C') {
      const a = apply(m, s.p[0], s.p[1]), b = apply(m, s.p[2], s.p[3]), e = apply(m, s.p[4], s.p[5]);
      return { c: 'C', p: [a[0], a[1], b[0], b[1], e[0], e[1]] };
    }
    return { c: s.c, p: apply(m, s.p[0], s.p[1]) };
  });
}

const r3 = (v: number): number => {
  const x = Number(v.toFixed(3));
  return Object.is(x, -0) ? 0 : x;
};

export function segsToD(segs: Seg[]): string {
  return segs
    .map((s) => (s.c === 'Z' ? 'Z' : s.c + s.p.map(r3).join(' ')))
    .join(' ');
}

/** Exact bounds of the segments (cubic extrema solved, not control hull). */
export function segsBounds(segs: Seg[]): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x: number, y: number): void => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const roots = (p0: number, p1: number, p2: number, p3: number): number[] => {
    const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
    const out: number[] = [];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) out.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
      }
    }
    return out.filter((t) => t > 0 && t < 1);
  };
  const bez = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s.c === 'Z') { cx = sx; cy = sy; continue; }
    if (s.c !== 'C') {
      cx = s.p[0]; cy = s.p[1];
      if (s.c === 'M') { sx = cx; sy = cy; }
      ext(cx, cy);
      continue;
    }
    const [x1, y1, x2, y2, x, y] = s.p;
    ext(x, y);
    for (const t of roots(cx, x1, x2, x)) ext(bez(cx, x1, x2, x, t), bez(cy, y1, y2, y, t));
    for (const t of roots(cy, y1, y2, y)) ext(bez(cx, x1, x2, x, t), bez(cy, y1, y2, y, t));
    cx = x; cy = y;
  }
  if (!isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// --- element walk ---------------------------------------------------------------

/** Elements whose children are never drawn directly. */
const NON_RENDERED = new Set([
  'defs', 'clippath', 'mask', 'pattern', 'symbol', 'marker', 'metadata', 'title', 'desc',
  'lineargradient', 'radialgradient', 'filter', 'style', 'script', 'font', 'text',
]);

function shapeD(name: string, attrs: string): string | null {
  const v = (k: string): number => {
    const s = attrOf(attrs, k);
    const x = s === undefined ? NaN : parseFloat(s);
    return isFinite(x) ? x : NaN;
  };
  const z = (k: string): number => { const x = v(k); return isFinite(x) ? x : 0; };
  switch (name) {
    case 'path':
      return attrOf(attrs, 'd') ?? null;
    case 'rect': {
      const x = z('x'), y = z('y'), w = v('width'), h = v('height');
      if (!(w > 0 && h > 0)) return null;
      let rx = v('rx'), ry = v('ry');
      if (!isFinite(rx)) rx = ry;
      if (!isFinite(ry)) ry = rx;
      rx = Math.min(Math.max(rx || 0, 0), w / 2);
      ry = Math.min(Math.max(ry || 0, 0), h / 2);
      if (!rx || !ry) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
      return `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
        `V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} ` +
        `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = z('cx'), cy = z('cy');
      const rx = name === 'circle' ? v('r') : v('rx');
      const ry = name === 'circle' ? v('r') : v('ry');
      if (!(rx > 0 && ry > 0)) return null;
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case 'polygon':
    case 'polyline': {
      const p = numbers(attrOf(attrs, 'points') ?? '');
      if (p.length < 4) return null;
      let d = `M${p[0]} ${p[1]}`;
      for (let k = 2; k + 1 < p.length; k += 2) d += ` L${p[k]} ${p[k + 1]}`;
      return name === 'polygon' ? d + ' Z' : d;
    }
    case 'line':
      return `M${z('x1')} ${z('y1')} L${z('x2')} ${z('y2')}`;
    default:
      return null;
  }
}

export interface Geometry {
  /** Every drawn shape as one absolute path, transforms baked in. */
  d: string;
  /** Exact bounds of that path in the root user space, or null if none. */
  bounds: Box | null;
}

/**
 * Flatten the drawn geometry of some SVG markup (the content of a root <svg>)
 * into one absolute path in the root user space: nested `transform`s are
 * applied, shapes become paths, and non-rendered subtrees (defs, clip paths,
 * masks, patterns, `display:none`) are skipped.
 */
export function flattenGeometry(inner: string): Geometry {
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[!?][^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack: { name: string; m: Matrix; skip: boolean }[] = [{ name: '', m: IDENTITY, skip: false }];
  const all: Seg[] = [];
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(inner))) {
    if (!t[2]) continue; // comment / CDATA / doctype / PI
    const name = t[2].toLowerCase().replace(/^.*:/, '');
    if (t[1]) {
      // close tag: pop back to the matching open element
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      continue;
    }
    const attrs = t[3];
    const top = stack[stack.length - 1];
    const hidden = attrOf(attrs, 'display') === 'none' || /display\s*:\s*none/i.test(attrOf(attrs, 'style') ?? '');
    const skip = top.skip || hidden || NON_RENDERED.has(name);
    const m = skip ? top.m : multiply(top.m, parseTransform(attrOf(attrs, 'transform')));
    if (!t[4]) stack.push({ name, m, skip });
    if (skip) continue;
    const d = shapeD(name, attrs);
    if (d) all.push(...transformSegs(parsePath(d), m));
  }
  return { d: segsToD(all), bounds: segsBounds(all) };
}
