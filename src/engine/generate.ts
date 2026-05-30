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
} from './types';

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
function generateField(rng: RNG, fur: RNG): Field {
  const baseRoll = rng.pick(GENERATABLE);
  const mode = rng.weighted<FieldMode>([
    ['plain', 0.55],
    ['division', 0.3],
    ['variation', 0.15],
  ]);

  // Furs read cleanly as a plain field or one half of a division; variations of
  // a fur pattern get visually noisy, so those stay on metals/colours.
  const useFur = mode !== 'variation' && fur.chance(0.15);
  const base = useFur ? (fur.pick(FURS) as Tincture) : baseRoll;

  if (mode === 'plain') {
    return { mode, tinctures: [base] };
  }

  // For divided / varied fields we pair the base with a contrasting tincture so
  // the two regions always read cleanly against each other.
  const second = contrastingWith(rng, base);
  if (mode === 'division') {
    return { mode, tinctures: [base, second], division: rng.pick(DIVISIONS) };
  }
  return { mode, tinctures: [base, second], variation: rng.pick(VARIATIONS) };
}

function arrangementFor(rng: RNG, count: number): Arrangement {
  if (count === 1) return 'one';
  if (count === 2) return rng.chance(0.3) ? 'in-pale' : 'in-fess';
  return 'two-and-one';
}

function generateCharges(rng: RNG, fieldPrimary: Tincture): ChargeGroup[] {
  const count = rng.weighted<number>([
    [1, 0.4],
    [3, 0.45],
    [2, 0.15],
  ]);
  // The bundled pack (if enabled) shares the pool with the built-in geometric
  // charges. The pack roll is only consumed when the pack is registered, so
  // pack-disabled output is unchanged.
  const pack = listBundledChargeIds();
  const charge =
    pack.length > 0 && rng.chance(0.45) ? rng.pick(pack) : rng.pick(CHARGE_IDS);
  const group: ChargeGroup = {
    charge,
    tincture: contrastingWith(rng, fieldPrimary),
    count,
    arrangement: arrangementFor(rng, count),
  };
  return [group];
}

function generateOrdinary(rng: RNG, fieldPrimary: Tincture): Ordinary {
  return {
    type: rng.pick(ORDINARIES),
    tincture: contrastingWith(rng, fieldPrimary),
  };
}

/**
 * Generate a coat-of-arms spec deterministically from a seed string.
 *
 * Invariants this guarantees (see tests):
 *  - The same seed always returns a deep-equal spec.
 *  - Any ordinary or charge contrasts with the primary field tincture.
 *  - Divided/varied fields use two contrasting tinctures.
 *
 * To keep generated arms always heraldically correct, overlying ordinaries and
 * charges are only added to PLAIN fields. Divided/varied fields stand on their
 * own (counterchanging over a division is a later feature). This yields two
 * clean families of output rather than risking colour-on-colour overlaps.
 */
export function generate(seed: string): Spec {
  const rng = new RNG(seed);
  const fur = new RNG(`${seed}|fur`);
  const field = generateField(rng, fur);
  const primary = field.tinctures[0];

  const spec: Spec = { shield: 'heater', field, charges: [] };

  if (field.mode === 'plain') {
    const content = rng.weighted<'ordinary' | 'charges' | 'none'>([
      ['ordinary', 0.45],
      ['charges', 0.45],
      ['none', 0.1],
    ]);
    if (content === 'ordinary') {
      spec.ordinary = generateOrdinary(rng, primary);
    } else if (content === 'charges') {
      spec.charges = generateCharges(rng, primary);
    }
  }

  return spec;
}
