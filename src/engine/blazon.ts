import { labelOf } from './tinctures';
import { getCharge } from './charges';
import { getOrdinaryAsset, getFieldAsset, getVariationAsset } from './assets';
import { positionOf } from './options';
import type { Spec, Field, Ordinary, ChargeGroup, Position } from './types';

const DIVISION_WORD: Record<string, string> = {
  'per-pale': 'Per pale',
  'per-fess': 'Per fess',
  'per-bend': 'Per bend',
  'per-chevron': 'Per chevron',
  'per-saltire': 'Per saltire',
  quarterly: 'Quarterly',
};

const VARIATION_WORD: Record<string, string> = {
  barry: 'Barry',
  paly: 'Paly',
  checky: 'Checky',
};

const ORDINARY_NAME: Record<string, string> = {
  chief: 'chief',
  pale: 'pale',
  fess: 'fess',
  bend: 'bend',
  'bend-sinister': 'bend sinister',
  chevron: 'chevron',
  cross: 'cross',
  saltire: 'saltire',
  pile: 'pile',
};

const COUNT_WORD: Record<number, string> = { 2: 'two', 3: 'three' };

function fieldBlazon(field: Field): string {
  if (field.mode === 'plain') {
    return labelOf(field.tinctures[0]);
  }
  if (field.mode === 'image') {
    const art = field.image ? getFieldAsset(field.image) : undefined;
    return art ? `a field of ${art.label}` : labelOf(field.tinctures[0]);
  }
  const [a, b] = field.tinctures;
  if (field.mode === 'division' && field.division) {
    return `${DIVISION_WORD[field.division]} ${labelOf(a)} and ${labelOf(b)}`;
  }
  if (field.mode === 'variation' && field.variation) {
    const word = VARIATION_WORD[field.variation];
    if (word) return `${word} ${labelOf(a)} and ${labelOf(b)}`;
    const v = getVariationAsset(field.variation);
    return v ? v.label : labelOf(a);
  }
  return labelOf(a);
}

function ordinaryBlazon(o: Ordinary): string {
  const name = ORDINARY_NAME[o.type] ?? getOrdinaryAsset(o.type)?.singular ?? o.type;
  const tinc = o.keepColour ? 'proper' : labelOf(o.tincture);
  return `a ${name} ${tinc}`;
}

const POSITION_SUFFIX: Record<Position, string> = {
  'top-left': ' in dexter chief',
  top: ' in chief',
  'top-right': ' in sinister chief',
  left: ' to dexter',
  center: '',
  right: ' to sinister',
  'bottom-left': ' in dexter base',
  bottom: ' in base',
  'bottom-right': ' in sinister base',
};

function flipTerm(g: ChargeGroup): string {
  if (g.flipX && g.flipY) return ' reversed and inverted';
  if (g.flipX) return ' reversed';
  if (g.flipY) return ' inverted';
  return '';
}

function chargeBlazon(g: ChargeGroup): string {
  const def = getCharge(g.charge);
  const singular = def ? def.singular : g.charge;
  const plural = def ? def.plural : `${g.charge}s`;
  const article = def ? def.article : 'a';
  const flip = flipTerm(g);
  const suffix = POSITION_SUFFIX[positionOf(g)] ?? '';
  // A charge shown in its own (original) colours is blazoned "proper".
  const tincture = g.keepColour ? 'proper' : labelOf(g.tincture);
  if (g.count === 1) {
    return `${article} ${singular} ${tincture}${flip}${suffix}`;
  }
  return `${COUNT_WORD[g.count] ?? g.count} ${plural} ${tincture}${flip}${suffix}`;
}

/** Render a spec as a formal blazon, e.g. "Azure, a bend Or". */
export function toBlazon(spec: Spec): string {
  const parts: string[] = [fieldBlazon(spec.field)];
  if (spec.ordinary) parts.push(ordinaryBlazon(spec.ordinary));
  for (const g of spec.charges) parts.push(chargeBlazon(g));
  return parts.join(', ');
}
