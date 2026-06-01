// Minimal Windows Metafile (WMF) -> SVG converter.
//
// Scope: the vector subset used by heraldry clip-art (e.g. heraldryclipart.com)
// -- filled Polygon / PolyPolygon records with solid brushes, optional pens and
// a polygon fill mode. Text, bitmaps and raster ops are intentionally ignored;
// such records are skipped, so a file that relies on them yields a partial or
// empty drawing rather than throwing.
//
// Coordinates are taken straight from the GDI records and framed by their own
// bounding box (the placeable header's bbox is in device units and does not
// match the logical point space, so it is not used for the viewBox).

// GDI record function numbers we handle.
const META_EOF = 0x0000;
const META_SETPOLYFILLMODE = 0x0106;
const META_SELECTOBJECT = 0x012d;
const META_DELETEOBJECT = 0x01f0;
const META_POLYGON = 0x0324;
const META_POLYPOLYGON = 0x0538;
const META_CREATEPENINDIRECT = 0x02fa;
const META_CREATEBRUSHINDIRECT = 0x02fc;

const BS_NULL = 1; // hollow brush -> no fill
const PS_NULL = 5; // invisible pen -> no stroke

const PLACEABLE_KEY = 0x9ac6cdd7;
const MAX_RECORDS = 200000;

interface PenObj { kind: 'pen'; style: number; width: number; color: number; }
interface BrushObj { kind: 'brush'; style: number; color: number; }
type GdiObject = PenObj | BrushObj | null;

interface PathOut { d: string; fill: string; rule: string; stroke?: string; strokeWidth?: number; }

function colorHex(c: number): string {
  const r = c & 0xff;
  const g = (c >> 8) & 0xff;
  const b = (c >> 16) & 0xff;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert a (placeable or standard) WMF byte buffer to an SVG string.
 * Returns null when the data is not a WMF we can read or yields no geometry.
 */
export function wmfToSvg(data: ArrayBuffer | Uint8Array): string | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength < 26) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  try {
    const placeable = dv.getUint32(0, true) === PLACEABLE_KEY;
    // placeable header (22) is followed by the standard WMF header (18); a bare
    // WMF starts with the standard header. Records begin after the header(s).
    let p = (placeable ? 22 : 0) + 18;

    const objects: GdiObject[] = [];
    const firstFree = (): number => {
      const i = objects.indexOf(null);
      return i < 0 ? objects.length : i;
    };

    let curBrush: BrushObj | null = null;
    let curPen: PenObj | null = null;
    let fillRule = 'evenodd'; // ALTERNATE (default) -> even-odd; WINDING -> nonzero

    const paths: PathOut[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const extend = (x: number, y: number): void => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    const makePath = (d: string): PathOut => {
      const fill = curBrush && curBrush.style !== BS_NULL ? colorHex(curBrush.color) : 'none';
      const out: PathOut = { d, fill, rule: fillRule };
      if (curPen && curPen.style !== PS_NULL) {
        out.stroke = colorHex(curPen.color);
        out.strokeWidth = Math.max(1, Math.abs(curPen.width) || 1);
      }
      return out;
    };

    let guard = 0;
    while (p + 6 <= dv.byteLength) {
      if (++guard > MAX_RECORDS) break;
      const size = dv.getUint32(p, true); // record size in 16-bit words
      const fn = dv.getUint16(p + 4, true);
      if (size < 3) break; // malformed (a record is at least size+function = 3 words)
      const a = p + 6; // start of parameters
      const end = p + size * 2;
      if (end > dv.byteLength) break;

      if (fn === META_EOF) break;
      else if (fn === META_CREATEBRUSHINDIRECT) {
        objects[firstFree()] = {
          kind: 'brush',
          style: dv.getUint16(a, true),
          color: dv.getUint32(a + 2, true),
        };
      } else if (fn === META_CREATEPENINDIRECT) {
        objects[firstFree()] = {
          kind: 'pen',
          style: dv.getUint16(a, true),
          width: dv.getInt16(a + 2, true),
          color: dv.getUint32(a + 6, true),
        };
      } else if (fn === META_SELECTOBJECT) {
        const o = objects[dv.getUint16(a, true)];
        if (o && o.kind === 'brush') curBrush = o;
        else if (o && o.kind === 'pen') curPen = o;
      } else if (fn === META_DELETEOBJECT) {
        const idx = dv.getUint16(a, true);
        if (objects[idx]) objects[idx] = null;
      } else if (fn === META_SETPOLYFILLMODE) {
        fillRule = dv.getUint16(a, true) === 2 ? 'nonzero' : 'evenodd';
      } else if (fn === META_POLYGON) {
        const n = dv.getUint16(a, true);
        if (a + 2 + n * 4 <= end) {
          let d = '';
          for (let i = 0; i < n; i++) {
            const x = dv.getInt16(a + 2 + i * 4, true);
            const y = dv.getInt16(a + 4 + i * 4, true);
            extend(x, y);
            d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
          }
          if (n > 0) paths.push(makePath(d + 'Z'));
        }
      } else if (fn === META_POLYPOLYGON) {
        const numPolys = dv.getUint16(a, true);
        const counts: number[] = [];
        let o = a + 2;
        for (let i = 0; i < numPolys && o + 2 <= end; i++) {
          counts.push(dv.getUint16(o, true));
          o += 2;
        }
        let d = '';
        for (const c of counts) {
          for (let i = 0; i < c && o + 4 <= end; i++) {
            const x = dv.getInt16(o, true);
            const y = dv.getInt16(o + 2, true);
            o += 4;
            extend(x, y);
            d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
          }
          d += 'Z ';
        }
        if (d) paths.push(makePath(d));
      }
      // all other records (window/mapmode/text/bitmap/etc.) are skipped

      p = end;
    }

    if (!paths.length || !isFinite(minX)) return null;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return null;

    const body = paths
      .map((pp) => {
        let s = `<path d="${pp.d.trim()}" fill="${pp.fill}" fill-rule="${pp.rule}"`;
        if (pp.stroke) s += ` stroke="${pp.stroke}" stroke-width="${pp.strokeWidth}"`;
        return s + '/>';
      })
      .join('');
    // Normalise to a (0,0)-origin viewBox so downstream fitters (which assume
    // origin 0) place the art correctly regardless of the logical coordinates.
    const shifted = minX !== 0 || minY !== 0 ? `<g transform="translate(${-minX} ${-minY})">${body}</g>` : body;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${shifted}</svg>`;
  } catch {
    return null;
  }
}
