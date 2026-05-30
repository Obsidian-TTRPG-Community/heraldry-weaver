import { RNG } from './rng';

// Lightweight seeded name generator for places and houses. Deterministic from
// the seed, so a rolled seed drives both the arms and a matching name.

export const PLACE_PREFIX = [
  'Cald', 'Win', 'Dun', 'Bram', 'Ash', 'Thorn', 'Grey', 'Black', 'Oak', 'Far',
  'Hollow', 'North', 'Ember', 'Frost', 'Stone', 'Wyn', 'Mar', 'Vel', 'Cor',
  'Hal', 'Red', 'West', 'Eld', 'Bryn', 'Glen', 'Raven', 'Holm', 'Fen', 'Dern',
  'Ald', 'Hart', 'Wend', 'Storm', 'Crag', 'Mire',
];

export const PLACE_SUFFIX = [
  'mere', 'hold', 'ford', 'wick', 'ton', 'fell', 'gate', 'reach', 'vale',
  'crest', 'moor', 'wood', 'stead', 'haven', 'march', 'spire', 'keep', 'ridge',
  'bourne', 'well', 'barrow', 'watch', 'cross', 'dale', 'shire', 'helm',
];

export const HOUSE_ONSET = [
  'Sur', 'Ald', 'Orl', 'Gar', 'Leb', 'Med', 'Rog', 'Veth', 'Drag', 'Moro',
  'Kor', 'Vance', 'Bel', 'Hawk', 'Stor', 'Var', 'Cael', 'Dray', 'Ven', 'Thal',
  'Brae', 'Fenn', 'Hollis', 'Mor', 'Quor',
];

export const HOUSE_MID = ['', '', 'o', 'a', 'e', 'i', 'en', 'ar', 'or'];

export const HOUSE_END = [
  'ovsky', 'enko', 'ric', 'mont', 'wyn', 'eth', 'ovic', 'ara', 'ius', 'ane',
  'ix', 'oll', 'ovin', 'heim', 'ward', 'gar', 'dane', 'orne', 'wick',
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Generate a place or house name deterministically from a seed. */
export function generateName(seed: string): string {
  const rng = new RNG(`${seed}:name`);
  if (rng.chance(0.4)) {
    const surname = cap(rng.pick(HOUSE_ONSET)) + rng.pick(HOUSE_MID) + rng.pick(HOUSE_END);
    return `House ${cap(surname)}`;
  }
  return cap(rng.pick(PLACE_PREFIX)) + rng.pick(PLACE_SUFFIX);
}
