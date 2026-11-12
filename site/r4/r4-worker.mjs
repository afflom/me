// Runs the locked R4 engine off the page's main thread.
// The page sends bytes it already verified by fingerprint; this worker checks them again,
// closes the network, then compiles and runs them. It moves bytes and decides nothing.
import { fingerprint } from "./fingerprint.mjs";

// R4's glue file also ships helpers that fetch weights from the network. Nothing here
// calls them, and the network is closed before the glue loads, so none can reach out.
const closed = () => { throw new Error("NetworkClosedInR4Worker"); };
self.fetch = () => Promise.reject(new Error("NetworkClosedInR4Worker"));
self.XMLHttpRequest = closed;
self.WebSocket = closed;
self.EventSource = closed;
self.importScripts = closed;

let r4 = null;

const handlers = {
  async init({ glue, wasm, lock }) {
    if ((await fingerprint(glue)) !== lock.glue.fingerprint) throw new Error("GlueFingerprintMismatch");
    if ((await fingerprint(wasm)) !== lock.wasm.fingerprint) throw new Error("WasmFingerprintMismatch");
    const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
    try {
      r4 = await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    r4.initSync({ module: wasm });
    return { ok: true };
  },
  load({ bytes, label }) {
    return JSON.parse(r4.studio_load_uorlut_bytes(bytes, label));
  },
  status() {
    return JSON.parse(r4.studio_weight_pack_status());
  },
  chat({ request }) {
    return JSON.parse(r4.studio_v1_chat_completions(JSON.stringify(request)));
  },
};

self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  try {
    const value = await handlers[kind](data);
    self.postMessage({ id, ok: true, value });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
};
