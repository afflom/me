// Written by generators/guests (guestglue) from app/specs/guests/glue/site/kappa/kappa.mjs.json. Do not edit.
// Kappa labels in the owner's browser: the content address of
// UOR-Foundation/kappa-registry ("<axis>:<lowercase hex digest>").
// The Prism's kappa facet (the reader PrismKappaLabel, in front of the
// builder's PrismKappa) reads the label, names the digest the browser host
// must re-derive from the bytes (WebCrypto's SHA-256 and SHA-512), compares it
// and decides. An axis the host cannot compute is never guessed: it answers
// unverified, never admit. Every admission also names the bytes on SHA-256,
// kappa-registry's mandatory secondary axis.
//   const kappa = makeKappa({ decide: rootDecide(dispatch) });
//   await kappa.admit(label, bytes) -> { sha256?, outcome, axis?, discriminant?, digestBytes? }
//   await kappa.labelOf(bytes, 'sha256') -> "sha256:..."

import { ask, fields, word } from '../glue/ask.mjs';

export const rootDecide = (dispatch) => word(dispatch, "kappa");

export function makeKappa({ decide }) {
  return {
    admit: async (label, bytes) => fields(await ask(decide, ["admit", label], bytes, [
        "digest SHA-256"
      ]), [
        "sha256",
        "outcome",
        "axis",
        "discriminant#",
        "digestBytes#"
      ]),
    labelOf: async (bytes, wire = "sha256") => fields(await ask(decide, ["label", wire], bytes), null),
  };
}
