// Fetches one locked object as the gzip pieces this page serves (R4-01).
//
// The engine and the weights are each larger than the 16 MiB one served object
// may be, so bootstrap/r4-objects.mjs cuts them into pieces named by SHA-256.
// Each piece is decompressed with a ceiling of its locked size, then refused
// unless it re-derives to its locked fingerprint; the joined object is refused
// unless it re-derives to the object's fingerprint. Neither the server nor the
// compression is trusted.
import { fingerprint, Refusal } from "./fingerprint.mjs";
import { admits } from "./grant.mjs";

// The page's own objects. Same origin as the page, so no grant is needed;
// any other base must be admitted by the owner's grant.
export const OWN_OBJECTS = new URL("./objects/", import.meta.url);

export function pieceUrl(base, piece) {
  return new URL(`${piece.fingerprint.slice("sha256-".length)}.gz`, base);
}

async function inflate(response, ceiling) {
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const out = new Uint8Array(ceiling);
  let at = 0;
  for await (const chunk of stream) {
    if (at + chunk.length > ceiling) throw new Refusal("PieceTooLarge", { ceiling });
    out.set(chunk, at);
    at += chunk.length;
  }
  return out.subarray(0, at);
}

export async function fetchPieces(entry, { base = OWN_OBJECTS, grant, onRequest } = {}) {
  const own = new URL(base).origin === OWN_OBJECTS.origin;
  if (!own && !admits(grant, String(base))) throw new Refusal("NetworkNotGranted", { origin: new URL(base).origin });
  if (!Array.isArray(entry.pieces) || entry.pieces.length === 0) throw new Refusal("NoPieces");
  const whole = new Uint8Array(entry.bytes);
  let at = 0;
  for (const piece of entry.pieces) {
    const url = pieceUrl(base, piece);
    onRequest?.(String(url));
    const response = await fetch(url, { credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Refusal("FetchFailed", { status: response.status });
    let bytes;
    try {
      bytes = await inflate(response, piece.bytes);
    } catch (error) {
      throw error instanceof Refusal ? error : new Refusal("PieceCorrupt");
    }
    if (bytes.length !== piece.bytes || (await fingerprint(bytes)) !== piece.fingerprint) {
      throw new Refusal("FingerprintMismatch", { piece: piece.fingerprint });
    }
    if (at + bytes.length > whole.length) throw new Refusal("FingerprintMismatch", { piece: piece.fingerprint });
    whole.set(bytes, at);
    at += bytes.length;
  }
  if (at !== entry.bytes || (await fingerprint(whole)) !== entry.fingerprint) {
    throw new Refusal("FingerprintMismatch", { expected: entry.fingerprint });
  }
  return whole;
}
