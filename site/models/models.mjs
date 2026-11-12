// Language and reasoning models routed into the Prism (MD-01).
//
//   const models = await openModels({ lock, decide: guestDecider(dispatch, { facet: "model" }), grant, halted });
//   await models.prepare("smollm2-135m-instruct");          // fetch, check, keep, load: as the decision says
//   models.connect(r4);                                     // R4 routes to each model that may run
//   const { outcome, answer, receipt } = await r4.askRouted({ target: models.route("text-generation"), prompt });
//
// A model comes from a hub (Hugging Face) pinned by commit, in a standard format
// (ONNX today; GGUF has its field in the decision and the lock), with its runtime
// pinned by package version. site/models/models.lock.json names every byte by
// SHA-256 and the page serves them as pieces (bootstrap/model-objects.mjs). The
// browser keeps each file in OPFS by fingerprint and re-checks it on every read.
//
// Whether a model may be fetched or run is the Prism Models decision
// (app/src/PrismModels.lex.tex, facet "model"): source format runtime weights
// route halted -> run | fetch | ask | refuse. Whether its answer may be shown is
// R4's routed mode and the Boundary. This file moves bytes and decides nothing.
import { Refusal } from "../r4/fingerprint.mjs";
import { opfsStore, openByFingerprint } from "../r4/store.mjs";

export const OWN_MODEL_OBJECTS = new URL("./objects/", import.meta.url);
export const EMPTY_MODEL_GRANT = Object.freeze({ models: Object.freeze([]) });
export const FORMATS = Object.freeze(["onnx", "gguf"]);
const FINGERPRINT = /^sha256-[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

// The request line, in the model's field order.
export const modelLine = ({ source, format, runtime, weights, route, halted }) =>
  [source, format, runtime, weights, route, halted].join(" ");

const pinned = (file) => FINGERPRINT.test(file?.fingerprint ?? "") && Number.isInteger(file.bytes) &&
  Array.isArray(file.pieces) && file.pieces.length > 0 && file.pieces.every((p) => FINGERPRINT.test(p.fingerprint));

// Locked: the model, its hub commit, every file it loads and every runtime it needs are pinned.
export function sourceOf(lock, model) {
  if (!model) return "unlocked";
  const runtimes = (model.runtimes ?? []).map((id) => lock.runtimes.find((r) => r.id === id));
  const ok = model.source?.hub === "huggingface" && COMMIT.test(model.source?.revision ?? "") &&
    model.files?.length > 0 && model.files.every(pinned) && runtimes.length > 0 &&
    runtimes.every((r) => r && r.format === model.format && r.files.every(pinned));
  return ok ? "locked" : "unlocked";
}

const worst = (states) => (states.includes("mismatch") ? "mismatch" : states.includes("missing") ? "missing" : "match");

export async function openModels({
  lock,
  decide,
  store = opfsStore(),
  grant = EMPTY_MODEL_GRANT,
  halted = () => "no",
  base = OWN_MODEL_OBJECTS,
  workerUrl = new URL("./model-worker.mjs", import.meta.url),
  onRequest,
  onProgress,
}) {
  if (typeof decide !== "function") throw new Refusal("NoDecision");
  const held = new Map(); // fingerprint -> verified bytes, this session
  const workers = new Map(); // runtime set -> worker
  const ready = new Map(); // model id -> { worker, decision }

  const find = (id) => lock.models.find((m) => m.id === id) ?? null;
  const runtimeFiles = (model) => model.runtimes.flatMap((id) => lock.runtimes.find((r) => r.id === id).files);
  const granted = (id) => Array.isArray(grant?.models) && grant.models.includes(id);

  async function stateOf(files) {
    const states = [];
    for (const file of files) {
      if (held.has(file.fingerprint)) { states.push("match"); continue; }
      const got = await store.get(file.fingerprint);
      if (got.state === "match") held.set(file.fingerprint, got.bytes);
      states.push(got.state);
    }
    return worst(states);
  }

  // Ask the decision about one model as it stands now. Nothing moves.
  async function judge(id, model = find(id)) {
    const source = sourceOf(lock, model);
    const locked = source === "locked";
    const fields = {
      source,
      format: FORMATS.includes(model?.format) ? model.format : "other",
      runtime: locked ? await stateOf(runtimeFiles(model)) : "missing",
      weights: locked ? await stateOf(model.files) : "missing",
      route: granted(id) ? "granted" : "ungranted",
      halted: halted() === "yes" ? "yes" : "no",
    };
    const line = modelLine(fields);
    const { outcome } = await decide(line);
    return { id, outcome, line, fields };
  }

  async function fetchMissing(files) {
    for (const file of files) {
      if (held.has(file.fingerprint)) continue;
      onProgress?.({ fetching: file.path ?? file.fingerprint, bytes: file.bytes });
      const got = await openByFingerprint(store, { ...file, label: "public" }, { base, onRequest });
      if (got.state !== "match") return got.state;
      held.set(file.fingerprint, got.bytes);
    }
    return "match";
  }

  const withBytes = (files) => files.map((f) => ({ path: f.path, role: f.role, fingerprint: f.fingerprint, bytes: held.get(f.fingerprint).slice() }));

  async function workerFor(model) {
    const key = model.runtimes.join("+");
    if (workers.has(key)) return workers.get(key);
    const worker = startWorker(workerUrl);
    const runtime = withBytes(runtimeFiles(model));
    await worker.call("init", { runtime }, runtime.map((f) => f.bytes.buffer));
    workers.set(key, worker);
    return worker;
  }

  // Bring one model to "run" as far as the decision allows: fetch only on
  // "fetch", load only on "run". Returns the last decision.
  async function prepare(id) {
    if (ready.has(id)) {
      const again = await judge(id);
      if (again.outcome !== "run") ready.delete(id);
      return again;
    }
    let decision = await judge(id);
    if (decision.outcome === "fetch") {
      const model = find(id);
      if (decision.fields.runtime === "missing") await fetchMissing(runtimeFiles(model));
      if (decision.fields.weights === "missing") await fetchMissing(model.files);
      decision = await judge(id);
    }
    if (decision.outcome !== "run") return decision;
    const model = find(id);
    onProgress?.({ loading: id });
    const worker = await workerFor(model);
    onProgress?.({ runtime: model.runtimes });
    const files = withBytes(model.files);
    await worker.call("load", {
      model: { id, task: model.task, dtype: model.dtype, repository: model.source.repository, revision: model.source.revision, files },
      remote: lock.sources.huggingface,
    }, files.map((f) => f.bytes.buffer));
    ready.set(id, { worker, decision });
    return decision;
  }

  // Every call re-asks the decision, so a halt or a withdrawn grant stops the next one.
  async function using(id) {
    const decision = await judge(id);
    if (decision.outcome !== "run" || !ready.has(id)) throw new Refusal("ModelMayNotRun", { id, outcome: decision.outcome, line: decision.line });
    return ready.get(id).worker;
  }

  async function generate(id, prompt, { maxTokens = 64, system } = {}) {
    const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
    return (await (await using(id)).call("generate", { model: id, messages, maxTokens })).text;
  }

  async function embed(id, texts) {
    return (await (await using(id)).call("embed", { model: id, texts })).vectors;
  }

  return {
    list: () => lock.models.map(({ id, title, task, format, source }) => ({ id, title, task, format, source })),
    judge,
    prepare,
    generate,
    embed,
    // R4 routes a task to the first granted model that does it.
    route: (task) => lock.models.find((m) => m.task === task && granted(m.id))?.id ?? null,
    // Hand R4 each model that may run, as a route it can send a request to.
    connect(r4, { maxTokens = 64 } = {}) {
      for (const [id, { decision }] of ready) {
        const model = find(id);
        if (model.task !== "text-generation") continue;
        r4.registerRoute({
          id,
          entry: { id, decision: decision.outcome, line: decision.line, source: model.source },
          run: (prompt) => generate(id, prompt, { maxTokens }),
        });
      }
    },
    stop() { for (const w of workers.values()) w.stop(); workers.clear(); ready.clear(); },
  };
}

function startWorker(url) {
  const w = new Worker(url, { type: "module" });
  let next = 0;
  const waiting = new Map();
  w.onmessage = ({ data }) => {
    const p = waiting.get(data?.id);
    if (!p) return; // only answers to this page's calls
    waiting.delete(data.id);
    if (data.ok) p.resolve(data.value); else p.reject(new Error(data.error));
  };
  w.onerror = (e) => { for (const p of waiting.values()) p.reject(new Error(e.message || "WorkerError")); waiting.clear(); };
  return {
    call(kind, payload, transfer = []) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        w.postMessage({ ...payload, id, kind }, transfer);
      });
    },
    stop() { w.terminate(); },
  };
}
