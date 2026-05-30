import type {
  Division,
  Variation,
  OrdinaryType,
  Arrangement,
  ShieldShape,
  Zone,
  Position,
} from './types';

export const SHIELDS: readonly ShieldShape[] = [
  'heater',
  'french',
  'spanish',
  'lozenge',
  'round',
];

export const SHIELD_LABEL: Record<ShieldShape, string> = {
  heater: 'Heater',
  french: 'French',
  spanish: 'Spanish (rounded)',
  lozenge: 'Lozenge',
  round: 'Round',
};

export const ZONES: readonly Zone[] = ['field', 'chief', 'base'];

export const ZONE_LABEL: Record<Zone, string> = {
  field: 'On the field',
  chief: 'In chief (top)',
  base: 'In base (bottom)',
};

/** Row-major 3x3 order, suitable for laying out a picker grid. */
export const POSITIONS: readonly Position[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

export const POSITION_LABEL: Record<Position, string> = {
  'top-left': 'Dexter chief',
  top: 'Chief',
  'top-right': 'Sinister chief',
  left: 'Dexter',
  center: 'Centre',
  right: 'Sinister',
  'bottom-left': 'Dexter base',
  bottom: 'Base',
  'bottom-right': 'Sinister base',
};

/** Effective placement anchor for a group, migrating the old zone field. */
export function positionOf(g: { position?: Position; zone?: Zone }): Position {
  if (g.position) return g.position;
  if (g.zone === 'chief') return 'top';
  if (g.zone === 'base') return 'bottom';
  return 'center';
}

export const DIVISIONS: readonly Division[] = [
  'per-pale',
  'per-fess',
  'per-bend',
  'per-chevron',
  'per-saltire',
  'quarterly',
];

export const VARIATIONS: readonly Variation[] = ['barry', 'paly', 'checky'];

export const ORDINARIES: readonly OrdinaryType[] = [
  'chief',
  'pale',
  'fess',
  'bend',
  'bend-sinister',
  'chevron',
  'cross',
  'saltire',
  'pile',
];

export const ARRANGEMENTS: readonly Arrangement[] = [
  'one',
  'in-fess',
  'in-pale',
  'two-and-one',
];

export const DIVISION_LABEL: Record<Division, string> = {
  'per-pale': 'Per pale',
  'per-fess': 'Per fess',
  'per-bend': 'Per bend',
  'per-chevron': 'Per chevron',
  'per-saltire': 'Per saltire',
  quarterly: 'Quarterly',
};

export const VARIATION_LABEL: Record<Variation, string> = {
  barry: 'Barry',
  paly: 'Paly',
  checky: 'Checky',
};

export const ORDINARY_LABEL: Record<OrdinaryType, string> = {
  chief: 'Chief',
  pale: 'Pale',
  fess: 'Fess',
  bend: 'Bend',
  'bend-sinister': 'Bend sinister',
  chevron: 'Chevron',
  cross: 'Cross',
  saltire: 'Saltire',
  pile: 'Pile',
};

export const ARRANGEMENT_LABEL: Record<Arrangement, string> = {
  one: 'Single',
  'in-fess': 'In fess (row)',
  'in-pale': 'In pale (column)',
  'two-and-one': 'Two and one',
};

/** Valid arrangements for a given charge count. */
export function arrangementsFor(count: number): Arrangement[] {
  if (count <= 1) return ['one'];
  if (count === 2) return ['in-fess', 'in-pale'];
  return ['two-and-one'];
}
