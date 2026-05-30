// Core domain model for Heraldry Weaver.
// A coat-of-arms is described by a serialisable Spec. The Spec is the single
// source of truth: it can be hashed/seeded, turned into a blazon string, and
// rendered to SVG. Everything downstream (Obsidian codeblocks, image export,
// Templater) operates on Specs.

export type Metal = 'or' | 'argent';
export type Colour = 'gules' | 'azure' | 'sable' | 'vert' | 'purpure';
/** The base figure family a fur is drawn with. */
export type FurPattern = 'ermine' | 'vair' | 'potent';
/** Standard named furs (the historical colour/arrangement variants). */
export type NamedFur =
  | 'ermine' | 'ermines' | 'erminois' | 'pean'
  | 'vair' | 'counter-vair' | 'potent' | 'counter-potent';
/** A custom fur, encoded `fur:<pattern>:<base>:<figure>[:c]` (c = countered). */
export type CustomFur = `fur:${string}`;
export type Fur = NamedFur | CustomFur;
export type Tincture = Metal | Colour | Fur;

export type TinctureClass = 'metal' | 'colour' | 'fur';

// How the field (background) is treated.
export type FieldMode = 'plain' | 'division' | 'variation';

export type Division =
  | 'per-pale'
  | 'per-fess'
  | 'per-bend'
  | 'per-chevron'
  | 'per-saltire'
  | 'quarterly';

export type Variation = 'barry' | 'paly' | 'checky';

export interface Field {
  mode: FieldMode;
  /** 1 tincture for plain; 2 for division/variation (dexter/chief first). */
  tinctures: Tincture[];
  division?: Division;
  variation?: Variation;
}

export type OrdinaryType =
  | 'chief'
  | 'pale'
  | 'fess'
  | 'bend'
  | 'bend-sinister'
  | 'chevron'
  | 'cross'
  | 'saltire'
  | 'pile';

export interface Ordinary {
  type: OrdinaryType;
  tincture: Tincture;
}

export type Arrangement = 'one' | 'in-fess' | 'in-pale' | 'two-and-one';

/** Vertical band a charge group occupies. Superseded by Position; kept so
 *  older saved arms still resolve. */
export type Zone = 'field' | 'chief' | 'base';

/** 3x3 placement anchor for a charge group. */
export type Position =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export interface ChargeGroup {
  /** Charge id, e.g. 'mullet'. Resolves against the charge registry. */
  charge: string;
  tincture: Tincture;
  count: number; // 1..3 in v0.1
  arrangement: Arrangement;
  /** Deprecated: vertical band. Mapped to Position when position is absent. */
  zone?: Zone;
  /** Placement anchor. Defaults to 'center'. */
  position?: Position;
  /** Size multiplier on the anchor's base size. Defaults to 1. */
  scale?: number;
  /** Mirror the charge horizontally (turned to sinister). */
  flipX?: boolean;
  /** Flip the charge vertically (inverted). */
  flipY?: boolean;
}

export type ShieldShape = 'heater' | 'french' | 'spanish' | 'lozenge' | 'round';

export interface Spec {
  shield: ShieldShape;
  field: Field;
  ordinary?: Ordinary;
  charges: ChargeGroup[];
}

export interface Arms {
  seed: string;
  spec: Spec;
  blazon: string;
  svg: string;
}
