import type { Spec } from './types';

// Compact, shareable encoding of a coat-of-arms spec for troubleshooting and
// sharing. Deliberately contains only the spec (field, ordinary, charges) — no
// imported image data. If a config references a custom charge id, the recipient
// needs that charge imported for it to render; everything else is self-contained.

const PREFIX = 'HF1:';

function toB64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function fromB64(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

export function encodeSpec(spec: Spec): string {
  return PREFIX + toB64(JSON.stringify(spec));
}

/** Parse an HF1 string or raw spec JSON. Returns null if it isn't a valid spec. */
export function decodeSpec(input: string): Spec | null {
  try {
    const trimmed = input.trim();
    const body = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
    const json = body.startsWith('{') ? body : fromB64(body);
    const spec = JSON.parse(json) as Spec;
    if (
      !spec ||
      typeof spec !== 'object' ||
      !spec.field ||
      !Array.isArray(spec.field.tinctures) ||
      !Array.isArray(spec.charges)
    ) {
      return null;
    }
    if (!spec.shield) spec.shield = 'heater';
    return spec;
  } catch {
    return null;
  }
}
