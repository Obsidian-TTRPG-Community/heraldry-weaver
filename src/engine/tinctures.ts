import type {
  Tincture, TinctureClass, Metal, Colour, FurPattern, NamedFur,
} from './types';

export const METALS = ['or', 'argent'] as const;
export const COLOURS = ['gules', 'azure', 'sable', 'vert', 'purpure'] as const;
/** Base furs used by random generation (kept to the two classics). */
export const FURS = ['ermine', 'vair'] as const;

// Random generation draws fields from metals + colours (+ the two base furs,
// handled separately in generate.ts). Overlays stay metal/colour.
export const GENERATABLE: readonly Tincture[] = [...METALS, ...COLOURS];

const SOLID_HEX: Record<Metal | Colour, string> = {
  or: '#E0A82E',
  argent: '#F2F2EC',
  gules: '#B23A2E',
  azure: '#2B5FA5',
  sable: '#1A1A1A',
  vert: '#2E7D3A',
  purpure: '#6B2C91',
};

const SOLID_LABEL: Record<Metal | Colour, string> = {
  or: 'Or', argent: 'Argent', gules: 'Gules', azure: 'Azure',
  sable: 'Sable', vert: 'Vert', purpure: 'Purpure',
};

// Back-compat exports (metals + colours only now; furs resolve dynamically).
export const TINCTURE_HEX = SOLID_HEX;
export const TINCTURE_LABEL = SOLID_LABEL;

export interface FurInfo {
  pattern: FurPattern;
  base: Metal | Colour;   // the field tincture of the fur
  figure: Metal | Colour; // the spots / bells / potents tincture
  counter: boolean;       // mirrored arrangement (vair / potent)
}

/** The standard named furs and their (pattern, base, figure, counter). */
export const FUR_PRESETS: Record<NamedFur, FurInfo> = {
  ermine:           { pattern: 'ermine', base: 'argent', figure: 'sable',  counter: false },
  ermines:          { pattern: 'ermine', base: 'sable',  figure: 'argent', counter: false },
  erminois:         { pattern: 'ermine', base: 'or',     figure: 'sable',  counter: false },
  pean:             { pattern: 'ermine', base: 'sable',  figure: 'or',     counter: false },
  vair:             { pattern: 'vair',   base: 'argent', figure: 'azure',  counter: false },
  'counter-vair':   { pattern: 'vair',   base: 'argent', figure: 'azure',  counter: true  },
  potent:           { pattern: 'potent', base: 'argent', figure: 'azure',  counter: false },
  'counter-potent': { pattern: 'potent', base: 'argent', figure: 'azure',  counter: true  },
};

export const NAMED_FURS = Object.keys(FUR_PRESETS) as NamedFur[];
export const FUR_PATTERNS: readonly FurPattern[] = ['ermine', 'vair', 'potent'];

const NAMED_FUR_LABEL: Record<NamedFur, string> = {
  ermine: 'Ermine', ermines: 'Ermines', erminois: 'Erminois', pean: 'Pean',
  vair: 'Vair', 'counter-vair': 'Counter-vair',
  potent: 'Potent', 'counter-potent': 'Counter-potent',
};

// Furs offered as quick swatches in the builder's field rows. Variants and
// custom recolours are reached through the fur editor.
export const FIELD_TINCTURES: readonly Tincture[] = [...METALS, ...COLOURS, 'ermine', 'vair'];

/** Build the encoded id for a custom fur. */
export function makeFur(pattern: FurPattern, base: Tincture, figure: Tincture, counter = false): Tincture {
  return `fur:${pattern}:${base}:${figure}${counter ? ':c' : ''}` as Tincture;
}

/** Resolve any fur (named preset or `fur:` string) to its parts, else null. */
export function furInfo(t: Tincture): FurInfo | null {
  const preset = (FUR_PRESETS as Record<string, FurInfo>)[t];
  if (preset) return preset;
  if (typeof t === 'string' && t.startsWith('fur:')) {
    const [, pattern, base, figure, c] = t.split(':');
    if (!pattern || !base || !figure) return null;
    return {
      pattern: pattern as FurPattern,
      base: base as Metal | Colour,
      figure: figure as Metal | Colour,
      counter: c === 'c',
    };
  }
  return null;
}

/** Match a FurInfo to a named preset id, if one exists. */
export function matchPreset(info: FurInfo): NamedFur | null {
  for (const [name, p] of Object.entries(FUR_PRESETS)) {
    if (p.pattern === info.pattern && p.base === info.base && p.figure === info.figure && p.counter === info.counter) {
      return name as NamedFur;
    }
  }
  return null;
}

export function isFur(t: Tincture): boolean {
  return furInfo(t) !== null;
}

export function tinctureClass(t: Tincture): TinctureClass {
  if ((METALS as readonly string[]).includes(t)) return 'metal';
  if ((COLOURS as readonly string[]).includes(t)) return 'colour';
  return 'fur';
}

export function hexOf(t: Tincture): string {
  const solid = (SOLID_HEX as Record<string, string>)[t];
  if (solid) return solid;
  const f = furInfo(t);
  if (f) return SOLID_HEX[f.base] ?? '#888888';
  return '#888888';
}

export function labelOf(t: Tincture): string {
  const solid = (SOLID_LABEL as Record<string, string>)[t];
  if (solid) return solid;
  if ((NAMED_FUR_LABEL as Record<string, string>)[t]) return (NAMED_FUR_LABEL as Record<string, string>)[t];
  const f = furInfo(t);
  if (f) {
    const named = matchPreset(f);
    if (named) return NAMED_FUR_LABEL[named];
    const base = SOLID_LABEL[f.base] ?? f.base;
    const fig = SOLID_LABEL[f.figure] ?? f.figure;
    if (f.pattern === 'ermine') return `${base} ermined ${fig}`;
    const stem = f.pattern === 'vair' ? 'airy' : 'otenty'; // Vairy / Potenty
    const head = f.pattern === 'vair' ? 'V' : 'P';
    const prefix = f.counter ? 'Counter-' : '';
    return `${prefix}${head}${stem} ${base} and ${fig}`;
  }
  return String(t);
}

/**
 * The rule of tincture: do not place colour on colour, nor metal on metal.
 * Furs are neither and may sit against either. Two tinctures "contrast" when
 * placing one over the other is heraldically sound.
 */
export function contrasts(a: Tincture, b: Tincture): boolean {
  const ca = tinctureClass(a);
  const cb = tinctureClass(b);
  if (ca === 'fur' || cb === 'fur') return true;
  return ca !== cb;
}
