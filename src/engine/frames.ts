import type { FlagShape } from './types';

/**
 * A flag/banner frame: its own canvas size plus the outline used as both clip
 * and border. The field+ordinary composition is authored in the 200x230 shield
 * "design space" and non-uniformly scaled into (w, h) at render time — which is
 * exactly how flag ordinaries read (a fess spans the full width, a saltire runs
 * corner to corner). Charges are placed separately so they stay undistorted.
 */
export interface FlagFrame {
  w: number;
  h: number;
  /** Outline path in this frame's own coordinates. */
  clip: string;
}

// Ordered for the dropdown: rectangles, swallowtails, pennons, hanging banners.
export const FLAG_SHAPES: FlagShape[] = [
  'flag', 'banner', 'vertical',
  'swallowtail', 'double-swallowtail', 'burgee',
  'pennon', 'tapered-pennon', 'streamer',
  'gonfalon', 'gonfalon-fork', 'pointed', 'rounded', 'ragged',
];

export const FLAG_LABEL: Record<FlagShape, string> = {
  flag: 'Flag (3:2)',
  banner: 'Banner (square)',
  vertical: 'Vertical banner',
  swallowtail: 'Swallowtail',
  'double-swallowtail': 'Double swallowtail',
  burgee: 'Burgee',
  pennon: 'Pennon (triangle)',
  'tapered-pennon': 'Tapered pennon',
  streamer: 'Streamer',
  gonfalon: 'Gonfalon (three tails)',
  'gonfalon-fork': 'Gonfalon (swallowtail)',
  pointed: 'Pointed banner',
  rounded: 'Rounded banner',
  ragged: 'Ragged banner',
};

const FRAMES: Record<FlagShape, FlagFrame> = {
  // --- rectangles ---
  flag: { w: 300, h: 200, clip: 'M0 0 L300 0 L300 200 L0 200 Z' },
  banner: { w: 230, h: 230, clip: 'M0 0 L230 0 L230 230 L0 230 Z' },
  vertical: { w: 170, h: 250, clip: 'M0 0 L170 0 L170 250 L0 250 Z' },

  // --- swallowtail family (notched fly) ---
  swallowtail: { w: 300, h: 200, clip: 'M0 0 L300 0 L235 100 L300 200 L0 200 Z' },
  // two notches -> top tail, central tongue, bottom tail
  'double-swallowtail': { w: 300, h: 210, clip: 'M0 0 L300 0 L240 52 L295 105 L240 158 L300 210 L0 210 Z' },
  // tapering swallowtail (boat burgee)
  burgee: { w: 300, h: 180, clip: 'M0 0 L300 35 L235 90 L300 145 L0 180 Z' },

  // --- pennon family (tapering to a point) ---
  pennon: { w: 300, h: 200, clip: 'M0 0 L300 100 L0 200 Z' },
  // rectangular hoist, then taper to a point at the fly
  'tapered-pennon': { w: 320, h: 170, clip: 'M0 0 L95 0 L320 85 L95 170 L0 170 Z' },
  // long tapering ribbon ending in a swallowtail
  streamer: { w: 420, h: 120, clip: 'M0 0 L420 25 L370 60 L420 95 L0 120 Z' },

  // --- hanging banners (vertical, decorative base) ---
  gonfalon: { w: 180, h: 260, clip: 'M0 0 L180 0 L180 200 L150 260 L120 200 L90 260 L60 200 L30 260 L0 200 Z' },
  // two tails with a central V-notch
  'gonfalon-fork': { w: 180, h: 260, clip: 'M0 0 L180 0 L180 260 L90 205 L0 260 Z' },
  // single point at the base
  pointed: { w: 170, h: 250, clip: 'M0 0 L170 0 L170 180 L85 250 L0 180 Z' },
  // rounded base
  rounded: { w: 170, h: 250, clip: 'M0 0 L170 0 L170 175 Q170 250 85 250 Q0 250 0 175 Z' },
  // battle-torn jagged fly edge
  ragged: { w: 280, h: 190, clip: 'M0 0 L255 0 L235 24 L272 47 L240 71 L268 95 L238 119 L270 143 L242 166 L260 190 L0 190 Z' },
};

export function flagFrame(shape: FlagShape): FlagFrame {
  return FRAMES[shape] ?? FRAMES.flag;
}
