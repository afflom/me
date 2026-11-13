// Kappa labels in the owner's browser: the content address of
// UOR-Foundation/kappa-registry ("<axis>:<lowercase hex digest>").
//
// The Prism's kappa facet (PrismKappa) reads the label and decides; this
// adapter only re-derives the digest from the bytes with what the browser
// host offers (WebCrypto's SHA-256 and SHA-512, named by AXES[].host) and
// carries one word to the facet: match, mismatch or uncomputed. An axis the
// host cannot compute is never guessed: it answers unverified, never admit.
// SHA-1 is not computed here, because kappa-registry admits SHA-1 only with
// collision detection, which WebCrypto does not offer.
//
//   const kappa = makeKappa({ decide: rootDecide(dispatch) });
//   await kappa.admit(label, bytes) -> { outcome, axis?, discriminant?, digestBytes?, sha256 }
//   await labelOf(bytes, 'sha256')  -> "sha256:..."
//
// Every ingest also names the bytes on SHA-256, kappa-registry's mandatory
// secondary axis, so an object is findable by its SHA-256 label whatever axis
// it arrived under.

import { AXES, NAMED } from './table.mjs';

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

export function rootDecide(dispatch) {
  return async (line) => String(await dispatch(`kappa ${line}`)).trim();
}

// The label of `bytes` on one axis the host computes.
export async function labelOf(bytes, wire = 'sha256') {
  const axis = AXES.find((a) => a.wire === wire);
  if (!axis) throw fail('kappa.axis', `unknown axis ${wire}`);
  if (!axis.host) throw fail('kappa.host', `this browser does not compute ${wire}`);
  return `${wire}:${hex(new Uint8Array(await crypto.subtle.digest(axis.host, bytes)))}`;
}

// The one word the facet takes from the browser: did these bytes re-derive
// to the digest the label names?
export async function digestWord(label, bytes) {
  const colon = label.indexOf(':');
  const axis = colon < 0 ? undefined : AXES.find((a) => a.wire === label.slice(0, colon));
  if (!axis || !axis.host || !bytes) return 'uncomputed';
  return (await labelOf(bytes, axis.wire)) === label ? 'match' : 'mismatch';
}

// The facet's answer, as fields. Anything it does not expect is a refusal.
export function parseAnswer(text) {
  const [outcome, wire, discriminant, digestBytes, ...rest] = String(text).trim().split(' ');
  if (NAMED.includes(outcome)) {
    const axis = AXES.find((a) => a.wire === wire);
    const ok = axis && rest.length === 0 && String(axis.discriminant) === discriminant && String(axis.digestBytes) === digestBytes;
    return ok ? { outcome, axis: wire, discriminant: axis.discriminant, digestBytes: axis.digestBytes } : { outcome: 'invalid' };
  }
  return wire === undefined ? { outcome } : { outcome: 'invalid' };
}

export function makeKappa({ decide }) {
  async function admit(label, bytes) {
    const word = await digestWord(label, bytes);
    const answer = parseAnswer(await decide(`${label} ${word}`));
    return { ...answer, sha256: bytes ? await labelOf(bytes, 'sha256') : undefined };
  }
  return { admit };
}
