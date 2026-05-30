// Tier 0 charge registry: self-drawn, geometric/simple charges authored in a
// canonical 100x100 box centred on (50,50). Each charge is a function of its
// fill colour so the renderer can recolour it per the spec's tincture.
//
// This same shape — { box, render(fill) } — is what user-imported and bundled
// public-domain charges will plug into later (Tier 1/2), so the renderer never
// needs to know where a charge came from.

export interface ChargeDef {
  id: string;
  /** Singular display name for blazon, e.g. "mullet". */
  singular: string;
  /** Plural display name, e.g. "mullets". */
  plural: string;
  /** Indefinite article for a single instance: "a" or "an". */
  article: 'a' | 'an';
  /** SVG markup inside a 100x100 viewBox, given a fill colour. */
  render: (fill: string) => string;
}

const star5 = (fill: string): string =>
  `<path d="M50 6 L60 36.3 L91.85 36.4 L66.17 55.25 L75.86 85.6 L50 67 L24.14 85.6 L33.83 55.25 L8.15 36.4 L40 36.25 Z" fill="${fill}"/>`;

export const CHARGES: Record<string, ChargeDef> = {
  mullet: {
    id: 'mullet',
    singular: 'mullet',
    plural: 'mullets',
    article: 'a',
    render: star5,
  },
  roundel: {
    id: 'roundel',
    singular: 'roundel',
    plural: 'roundels',
    article: 'a',
    render: (f) => `<circle cx="50" cy="50" r="40" fill="${f}"/>`,
  },
  annulet: {
    id: 'annulet',
    singular: 'annulet',
    plural: 'annulets',
    article: 'an',
    render: (f) =>
      `<circle cx="50" cy="50" r="38" fill="none" stroke="${f}" stroke-width="12"/>`,
  },
  lozenge: {
    id: 'lozenge',
    singular: 'lozenge',
    plural: 'lozenges',
    article: 'a',
    render: (f) => `<polygon points="50,6 86,50 50,94 14,50" fill="${f}"/>`,
  },
  billet: {
    id: 'billet',
    singular: 'billet',
    plural: 'billets',
    article: 'a',
    render: (f) => `<rect x="30" y="10" width="40" height="80" rx="2" fill="${f}"/>`,
  },
  crescent: {
    id: 'crescent',
    singular: 'crescent',
    plural: 'crescents',
    article: 'a',
    render: (f) =>
      `<path d="M20 46 A32 32 0 1 0 80 46 A26 26 0 1 1 20 46 Z" fill="${f}"/>`,
  },
  cross: {
    id: 'cross',
    singular: 'cross',
    plural: 'crosses',
    article: 'a',
    render: (f) =>
      `<path d="M40 10 H60 V40 H90 V60 H60 V90 H40 V60 H10 V40 H40 Z" fill="${f}"/>`,
  },
  heart: {
    id: 'heart',
    singular: 'heart',
    plural: 'hearts',
    article: 'a',
    render: (f) =>
      `<path d="M50 88 C 6 56 16 14 50 36 C 84 14 94 56 50 88 Z" fill="${f}"/>`,
  },
  tower: {
    id: 'tower',
    singular: 'tower',
    plural: 'towers',
    article: 'a',
    render: (f) =>
      `<g fill="${f}">` +
      `<rect x="30" y="40" width="40" height="50"/>` +
      `<rect x="28" y="32" width="10" height="10"/>` +
      `<rect x="45" y="32" width="10" height="10"/>` +
      `<rect x="62" y="32" width="10" height="10"/>` +
      `<path d="M44 66 a6 6 0 0 1 12 0 V90 H44 Z" fill="#00000055"/>` +
      `</g>`,
  },
  sword: {
    id: 'sword',
    singular: 'sword',
    plural: 'swords',
    article: 'a',
    render: (f) =>
      `<g fill="${f}">` +
      `<polygon points="50,6 55,66 45,66"/>` +
      `<rect x="33" y="66" width="34" height="7"/>` +
      `<rect x="46" y="73" width="8" height="16"/>` +
      `<circle cx="50" cy="92" r="5"/>` +
      `</g>`,
  },
  key: {
    id: 'key',
    singular: 'key',
    plural: 'keys',
    article: 'a',
    render: (f) =>
      `<g fill="${f}">` +
      `<circle cx="50" cy="24" r="15" fill="none" stroke="${f}" stroke-width="8"/>` +
      `<rect x="46" y="36" width="8" height="52"/>` +
      `<rect x="54" y="72" width="12" height="8"/>` +
      `<rect x="54" y="84" width="9" height="7"/>` +
      `</g>`,
  },
};

export const CHARGE_IDS: readonly string[] = Object.keys(CHARGES);

// Imported (Tier 2) charges register here at runtime. They are resolved by
// getCharge and offered in the builder, but deliberately excluded from random
// generation (which stays on the curated built-in set, CHARGE_IDS).
const imported: Record<string, ChargeDef> = {};

// Bundled pack charges (game-icons.net, CC BY 3.0) register here. Kept separate
// from `imported` so reloading user charges never clears the pack.
const bundled: Record<string, ChargeDef> = {};

export function registerCharge(def: ChargeDef): void {
  imported[def.id] = def;
}

export function registerBundledCharge(def: ChargeDef): void {
  bundled[def.id] = def;
}

export function clearImportedCharges(): void {
  for (const k of Object.keys(imported)) delete imported[k];
}

export function clearBundledCharges(): void {
  for (const k of Object.keys(bundled)) delete bundled[k];
}

export function isImported(id: string): boolean {
  return id in imported;
}

export function getCharge(id: string): ChargeDef | undefined {
  return imported[id] ?? bundled[id] ?? CHARGES[id];
}

/** All charge ids available to the builder: built-ins, pack, then imported. */
export function listChargeIds(): string[] {
  return [...Object.keys(CHARGES), ...Object.keys(bundled), ...Object.keys(imported)];
}

/** Pack charge ids currently registered (empty when the pack is disabled). */
export function listBundledChargeIds(): string[] {
  return Object.keys(bundled);
}
