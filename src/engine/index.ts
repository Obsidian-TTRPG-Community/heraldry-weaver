// Public engine API. The Obsidian plugin layer (codeblock/inline processors,
// library, image export) and any Templater scripts will consume only this.

export * from './types';
export {
  METALS,
  COLOURS,
  FURS,
  GENERATABLE,
  FIELD_TINCTURES,
  TINCTURE_HEX,
  TINCTURE_LABEL,
  tinctureClass,
  hexOf,
  labelOf,
  contrasts,
} from './tinctures';
export { RNG } from './rng';
export { CHARGES, CHARGE_IDS, getCharge, registerCharge, registerBundledCharge, clearImportedCharges, clearBundledCharges, isImported, listChargeIds } from './charges';
export type { ChargeDef } from './charges';
export { PACK_CHARGES, PACK_IDS } from './packCharges';
export { chargeFromSvg, stripColours } from './importCharge';
export type { ImportOptions } from './importCharge';
export {
  SHIELDS,
  SHIELD_LABEL,
  ZONES,
  ZONE_LABEL,
  POSITIONS,
  POSITION_LABEL,
  positionOf,
  DIVISIONS,
  VARIATIONS,
  ORDINARIES,
  ARRANGEMENTS,
  DIVISION_LABEL,
  VARIATION_LABEL,
  ORDINARY_LABEL,
  ARRANGEMENT_LABEL,
  arrangementsFor,
} from './options';
export { generate } from './generate';
export { generateName } from './names';
export { encodeSpec, decodeSpec } from './config';
export { toBlazon } from './blazon';
export { renderSvg } from './render';
export type { RenderOptions } from './render';

import type { Arms } from './types';
import { generate } from './generate';
import { toBlazon } from './blazon';
import { renderSvg } from './render';

/**
 * Generate a full coat-of-arms from a seed: spec + blazon + SVG.
 * This is the one call most consumers want.
 */
export function generateArms(seed: string, uid?: string | number): Arms {
  const spec = generate(seed);
  return {
    seed,
    spec,
    blazon: toBlazon(spec),
    svg: renderSvg(spec, { uid: uid ?? seed }),
  };
}
