// Network grants. A grant names the exact origins the owner admits. The empty grant admits nothing.
import { Refusal } from "./fingerprint.mjs";

export const EMPTY_GRANT = Object.freeze({ origins: Object.freeze([]) });

export function admits(grant, url) {
  let origin;
  try { origin = new URL(url).origin; } catch { return false; }
  return Array.isArray(grant?.origins) && grant.origins.includes(origin);
}

// fetch, but only for an admitted origin, and never with credentials or cookies.
export async function grantedFetch(grant, url, { onRequest } = {}) {
  if (!admits(grant, url)) throw new Refusal("NetworkNotGranted", { origin: safeOrigin(url) });
  onRequest?.(url);
  const response = await fetch(url, { credentials: "omit", cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Refusal("FetchFailed", { status: response.status });
  return new Uint8Array(await response.arrayBuffer());
}

function safeOrigin(url) {
  try { return new URL(url).origin; } catch { return "invalid"; }
}
