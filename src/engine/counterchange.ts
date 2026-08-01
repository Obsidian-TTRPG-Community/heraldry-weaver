import { getVariationAsset } from './assets';
import type { Field } from './types';

/**
 * Can this field be counterchanged?
 *
 * Counterchanging paints an element with the field's tinctures swapped, so it
 * only means something when the field lays two distinct tinctures out in
 * regions. A plain field has nothing to swap; imported field art and imported
 * tiling variations carry their own colours rather than a tincture pair.
 *
 * Shared by the renderer (which decides whether to mask) and the blazon writer
 * (which decides whether to say "counterchanged"), so the two never disagree.
 */
export function counterchangeable(field: Field): boolean {
  if (field.mode !== 'division' && field.mode !== 'variation') return false;
  if (field.mode === 'variation' && field.variation && getVariationAsset(field.variation)) {
    return false;
  }
  const [a, b] = field.tinctures;
  return !!b && a !== b;
}
