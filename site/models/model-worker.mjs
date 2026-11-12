// Runs one routed model off the page's main thread (MD-01).
//
// The page sends bytes it already verified by fingerprint: the runtime for the
// model's format and the model's own files. This worker checks every one again,
// closes the network, then loads the runtime from those bytes. The runtime asks
// for model files by their hub URL; `serve` answers only with locked, verified
// bytes and answers 404 for anything else, so nothing is ever fetched. It moves
// bytes and decides nothing: whether a model may run is the Prism's decision.
import { fingerprint } from "../r4/fingerprint.mjs";

const closed = () => { throw new Error("NetworkClosedInModelWorker"); };
const realFetch = self.fetch.bind(self);
self.fetch = () => Promise.reject(new Error("NetworkClosedInModelWorker"));
self.XMLHttpRequest = closed;
self.WebSocket = closed;
self.EventSource = closed;
self.importScripts = closed;

const blobUrl = (bytes, type) => URL.createObjectURL(new Blob([bytes], { type }));
let transformers = null;
const files = new Map(); // hub URL at the pinned commit -> verified bytes
const revisions = new Map(); // hub URL of a repository -> its pinned commit
const pipelines = new Map();
let refused = 0;

async function checked(list) {
  for (const f of list) {
    if ((await fingerprint(f.bytes)) !== f.fingerprint) throw new Error(`FingerprintMismatch ${f.path}`);
  }
  return list;
}

// The only fetch the runtime gets. Blob URLs are the runtime's own verified bytes.
async function serve(input) {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("blob:")) return realFetch(url);
  // The runtime names some files at "main" before it reads the revision option; the
  // bytes served are the pinned ones either way, and nothing else is ever served.
  const bytes = files.get(url.split("?")[0].replace(/\/resolve\/main\//, `/resolve/${revisions.get(url.split("/resolve/")[0]) ?? "main"}/`));
  if (!bytes) {
    refused += 1;
    return new Response(null, { status: 404, statusText: "NotLocked" });
  }
  return new Response(bytes, { status: 200, headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length) } });
}

const handlers = {
  async init({ runtime }) {
    const parts = Object.fromEntries((await checked(runtime)).map((f) => [f.role, f]));
    // The library bundles ONNX Runtime's wasm factory; the wasm itself is passed as verified bytes.
    if (!parts.library || !parts.wasm) throw new Error("RuntimeIncomplete");
    const url = blobUrl(parts.library.bytes, "text/javascript");
    try {
      transformers = await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const { env } = transformers;
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.useCustomCache = false;
    env.useWasmCache = false;
    env.fetch = serve;
    const onnx = env.backends.onnx;
    // The runtime's default wasmPaths name a CDN, which a dynamic import would reach
    // past the closed fetch. With no paths, the bundled factory runs on the verified bytes.
    delete onnx.wasm.wasmPaths;
    onnx.wasm.wasmBinary = parts.wasm.bytes.buffer.slice(parts.wasm.bytes.byteOffset, parts.wasm.bytes.byteOffset + parts.wasm.bytes.byteLength);
    onnx.wasm.numThreads = 1;
    onnx.wasm.initTimeout = 120000;
    onnx.wasm.proxy = false;
    return { version: env.version };
  },
  async load({ model, base, remote }) {
    revisions.set(`${remote}${model.repository}`, model.revision);
    for (const f of await checked(model.files)) files.set(`${remote}${model.repository}/resolve/${model.revision}/${f.path}`, f.bytes);
    const pipe = await transformers.pipeline(model.task, model.repository, { revision: model.revision, dtype: model.dtype, device: "wasm" });
    pipelines.set(model.id, { pipe, task: model.task });
    return { id: model.id, refused };
  },
  async generate({ model, messages, maxTokens = 64 }) {
    const { pipe } = pipelines.get(model) ?? {};
    if (!pipe) throw new Error("ModelNotLoaded");
    const out = await pipe(messages, { max_new_tokens: maxTokens, do_sample: false, return_full_text: false });
    const generated = out?.[0]?.generated_text;
    const text = Array.isArray(generated) ? generated.at(-1)?.content ?? "" : String(generated ?? "");
    return { text, refused };
  },
  async embed({ model, texts }) {
    const { pipe } = pipelines.get(model) ?? {};
    if (!pipe) throw new Error("ModelNotLoaded");
    const tensor = await pipe(texts, { pooling: "mean", normalize: true });
    return { vectors: tensor.tolist(), refused };
  },
};

self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  try {
    self.postMessage({ id, ok: true, value: await handlers[kind](data) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
};
