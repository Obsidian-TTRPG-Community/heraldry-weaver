import { RNG } from './rng';
import { GENERATABLE, FURS, contrasts } from './tinctures';
import { CHARGE_IDS, listBundledChargeIds } from './charges';
import { DIVISIONS, VARIATIONS, ORDINARIES } from './options';
import type {
  Spec,
  Field,
  FieldMode,
  Ordinary,
  ChargeGroup,
  Arrangement,
  Tincture,
  ShieldShape,
} from './types';

/**
 * Optional pools of user-imported content to mix into a roll. Every field is
 * optional and empty by default; when a pool is empty the generator takes no
 * extra RNG draws for it, so default rolls reproduce exactly as before.
 */
export interface GenerateOptions {
  shields?: string[];      // imported escutcheon ids
  charges?: string[];      // imported charge ids
  ordinaries?: string[];   // imported ordinary ids
  fields?: string[];       // imported field-image ids
  variations?: string[];   // imported variation ids
  furs?: Tincture[];       // custom fur tinctures (cfur:<id>)
}

/** Pick a generatable tincture that contrasts with `against`. */
function contrastingWith(rng: RNG, against: Tincture): Tincture {
  const pool = GENERATABLE.filter((t) => contrasts(t, against));
  return rng.pick(pool);
}

/**
 * Build the field. A separate `fur` RNG decides whether to swap in a fur for the
 * base tincture, so non-fur seeds consume the main stream exactly as before and
 * keep producing identical arms — only the ~15% that roll a fur diverge.
 */
function generateField(rng: RNG, fur: RNG, img: RNG, opts: GenerateOptions): Field {
  const baseRoll = rng.pick(GENERATABLE);
  const modes: [FieldMode, number][] = [
    ['plain', 0.55],
    ['division', 0.3],
    ['variation', 0.15],
  ];
  // An imported background image is its own field family (stands alone, like a
  // division). Only offered when such assets exist, so default rolls are intact.
  if (opts.fields?.length) modes.push(['image', 0.2]);
  const mode = rng.weighted<FieldMode>(modes);

  if (mode === 'image') {
    return { mode: 'image', tinctures: [baseRoll], image: img.pick(opts.fields!), bg: baseRoll };
  }

  // Furs read cleanly as a plain field or one half of a division; variations of
  // a fur pattern get visually noisy, so those stay on metals/colours. Custom
  // furs join the pool only when present (same draw count -> default intact).
  const useFur = mode !== 'variation' && fur.chance(0.15);
  const furPool = [...FURS, ...(opts.furs ?? [])] as Tincture[];
  const base = useFur ? fur.pick(furPool) : baseRoll;

  if (mode === 'plain') {
    return { mode, tinctures: [base] };
  }

  // For divided / varied fields we pair the base with a contrasting tincture so
  // the two regions always read cleanly against each other.
  const second = contrastingWith(rng, base);
  if (mode === 'division') {
    return { mode, tinctures: [base, second], division: rng.pick(DIVISIONS) };
  }
  const varPool = [...VARIATIONS, ...(opts.variations ?? [])];
  return { mode, tinctures: [base, second], variation: rng.pick(varPool) };
}

function arrangementFor(rng: RNG, count: number): Arrangement {
  if (count === 1) return 'one';
  if (count === 2) return rng.chance(0.3) ? 'in-pale' : 'in-fess';
  return 'two-and-one';
}

function generateCharges(rng: RNG, cust: RNG, fieldPrimary: Tincture, opts: GenerateOptions): ChargeGroup[] {
  const count = rng.weighted<number>([
    [1, 0.4],
    [3, 0.45],
    [2, 0.15],
  ]);
  // The bundled pack (if enabled) shares the pool with the built-in geometric
  // charges. The pack roll is only consumed when the pack is registered, so
  // pack-disabled output is unchanged.
  const pack = listBundledChargeIds();
  let charge =
    pack.length > 0 && rng.chance(0.45) ? rng.pick(pack) : rng.pick(CHARGE_IDS);
  // Imported charges (drawn on a separate stream, only when any exist).
  if (opts.charges?.length && cust.chance(0.5)) charge = cust.pick(opts.charges);
  const group: ChargeGroup = {
    charge,
    tincture: contrastingWith(rng, fieldPrimary),
    count,
    arrangement: arrangementFor(rng, count),
  };
  return [group];
}

function generateOrdinary(rng: RNG, cust: RNG, fieldPrimary: Tincture, opts: GenerateOptions): Ordinary {
  let type: ChargeGroup['charge'] = rng.pick(ORDINARIES);
  if (opts.ordinaries?.length && cust.chance(0.5)) type = cust.pick(opts.ordinaries);
  return {
    type,
    tincture: contrastingWith(rng, fieldPrimary),
  };
}

/**
 * Generate a coat-of-arms spec deterministically from a seed string.
 *
 * Invariants this guarantees (see tests):
 *  - The same seed (and same options) always returns a deep-equal spec.
 *  - With no options (default), output is identical to the built-in-only rolls.
 *  - Any ordinary or charge contrasts with the primary field tincture.
 *  - Divided/varied fields use two contrasting tinctures.
 *
 * Custom pools are drawn from dedicated sub-streams that are only touched when
 * the relevant pool is non-empty, so enabling custom content changes only the
 * arms that actually adopt a custom element.
 *
 * To keep generated arms always heraldically correct, overlying ordinaries and
 * charges are only added to PLAIN fields. Divided/varied/image fields stand on
 * their own. This yields clean families of output rather than risking overlaps.
 */
export function generate(seed: string, opts: GenerateOptions = {}): Spec {
  const rng = new RNG(seed);
  const fur = new RNG(`${seed}|fur`);
  const img = new RNG(`${seed}|img`);
  const cust = new RNG(`${seed}|custom`);

  const field = generateField(rng, fur, img, opts);
  const primary = field.tinctures[0];

  let shield: ShieldShape = 'heater';
  if (opts.shields?.length && cust.chance(0.4)) shield = cust.pick(opts.shields);

  const spec: Spec = { shield, field, charges: [] };

  if (field.mode === 'plain') {
    const content = rng.weighted<'ordinary' | 'charges' | 'none'>([
      ['ordinary', 0.45],
      ['charges', 0.45],
      ['none', 0.1],
    ]);
    if (content === 'ordinary') {
      spec.ordinary = generateOrdinary(rng, cust, primary, opts);
    } else if (content === 'charges') {
      spec.charges = generateCharges(rng, cust, primary, opts);
    }
  }

  return spec;
}
