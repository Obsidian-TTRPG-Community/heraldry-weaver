import type { ShieldShape } from './types';

// Canonical render space. All field/ordinary/charge geometry is expressed in
// this box; the renderer scales the whole SVG via viewBox.
export const SHIELD_W = 200;
export const SHIELD_H = 230;

// Usable interior bounds of the heater shield, used for placing charges.
export const FIELD_BOUNDS = { x0: 20, y0: 16, x1: 180, y1: 214 };

const HEATER = 'M20 16 L180 16 L180 110 Q180 196 100 214 Q20 196 20 110 Z';
const FRENCH =
  'M22 16 L178 16 L178 172 C178 196 156 205 130 210 C116 213 108 214 100 214 C92 214 84 213 70 210 C44 205 22 196 22 172 Z';
const SPANISH = 'M20 16 L180 16 L180 120 Q180 214 100 214 Q20 214 20 120 Z';
const LOZENGE = 'M100 14 L184 115 L100 216 L16 115 Z';
const ROUND =
  'M100 16 C158 16 184 64 184 115 C184 172 148 214 100 214 C52 214 16 172 16 115 C16 64 42 16 100 16 Z';

const PATHS: Record<ShieldShape, string> = {
  heater: HEATER,
  french: FRENCH,
  spanish: SPANISH,
  lozenge: LOZENGE,
  round: ROUND,
};

export function shieldPath(shape: ShieldShape): string {
  return PATHS[shape] ?? HEATER;
}
