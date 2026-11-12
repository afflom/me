// Content fingerprints. One form everywhere: "sha256-" followed by 64 lower-case hex digits.
// WebCrypto computes the digest, so the same code runs in a page, a worker and Node 20+.

export const FINGERPRINT = /^sha256-[0-9a-f]{64}$/;

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function fingerprint(bytes) {
  return "sha256-" + hex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function fingerprintText(text) {
  return fingerprint(new TextEncoder().encode(text));
}

// A typed refusal. Adapters move bytes and report; they never recover by guessing.
export class Refusal extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

// Canonical JSON: keys sorted, no spaces, so a receipt has one address.
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().filter((k) => value[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
