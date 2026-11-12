// What happens to one item Google returned: the router plans it, the
// detectors report what they see, and the vault keeps it only as the Boundary
// and storeDecision allow (vault.put asks the Boundary itself). Nothing here
// decides; it reports facts and passes answers on.
//
//   route(envelope)  -> the plan's stage names, from the design model's planOf
//                       media (optional until the router guest lands; without
//                       it every item goes straight to the vault's checks)
//   vault.put(bytes, {label, detector, identifier, pointer}) -> {outcome}
//
// Mail and calendar belong to the conversations and time domains, whose floor
// is confidential. Both carry personal identifiers (addresses), which the
// Boundary lets stay in the browser and never lets leave it.

export const LABEL = 'confidential';

// The place an item belongs to, by its media: the surface model's media table.
import { MEDIA as DOMAIN_OF } from '../surface/surface.mjs';

// Luhn-valid 13 to 19 digit runs with a card issuer's prefix (PCI DSS 3).
function hasCard(text) {
  for (const match of text.matchAll(/(?<![0-9])(?:[0-9][ -]?){12,18}[0-9](?![0-9])/g)) {
    const digits = match[0].replace(/[ -]/g, '');
    if (!/^(?:4|5[1-5]|2[2-7]|3[47]|6(?:011|5))/.test(digits)) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
      let d = digits.charCodeAt(digits.length - 1 - i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

// A one-time code, a password or a reset link sent to the owner.
const CREDENTIAL = /\b(?:verification code|security code|one[- ]time (?:code|pass(?:code|word))|passcode|login code|sign[- ]in code|your code is|temporary password|reset your password|password reset)\b/i;

// The detectors' report for the Boundary's `detector` field. A miss here is a
// known limit: the Boundary still never lets the value leave the browser.
export function detect(bytes) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (hasCard(text)) return 'pci';
  if (CREDENTIAL.test(text)) return 'credential';
  return 'none';
}

export function ingestInto({ vault, route = null }) {
  if (typeof vault?.put !== 'function') throw new Error('ingestInto needs the vault');
  return async function ingest({ envelope, frame, bytes }) {
    if (route) {
      const plan = await route(envelope);
      if (!plan.includes('storing')) return { outcome: 'refuse', reason: 'the plan keeps nothing' };
    }
    const result = await vault.put(bytes, {
      label: frame.prismlabel ?? LABEL,
      detector: detect(bytes),
      identifier: 'yes',
      pointer: `${frame.source}#${envelope.digest}`,
      about: { domain: DOMAIN_OF[envelope.media] ?? 11, media: envelope.media, at: Date.parse(frame.time ?? '') || Date.now() },
    });
    return typeof result === 'string' ? { outcome: result } : result;
  };
}
