// R4 in the Prism's browser: the page-side adapter.
//
//   const r4 = await openR4({ lock, decide: guestDecider(dispatch), boundary });
//   const { outcome, answer, receipt } = await r4.ask({ prompt: "Hello", context });
//
// What it does, in order:
//   1. Opens the locked R4 engine (glue + wasm) and the locked weights by fingerprint,
//      from OPFS when they are there and intact, else as the pieces this page serves.
//   2. Runs the engine in a worker with the network closed, and hot-loads the weights.
//   3. Asks the Prism R4 decision (app/src/PrismR4.lex.tex) whether an answer may be shown, then the
//      Boundary, then the model again with the Boundary's word. It decides nothing itself.
//   4. Returns the outcome with a receipt naming the mode and model.
import { EMPTY_GRANT, admits } from "./grant.mjs";
import { fingerprint, Refusal } from "./fingerprint.mjs";
import { openByFingerprint, opfsStore } from "./store.mjs";
import { OWN_OBJECTS } from "./pieces.mjs";
import { decisionLine, specDecider } from "./decide.mjs";
import { makeReceipt } from "./receipt.mjs";

const LABELS = ["public", "internal", "confidential", "restricted"];
const higherLabel = (a, b) => {
  if (a === "unlabeled" || b === "unlabeled") return "unlabeled";
  return LABELS[Math.max(LABELS.indexOf(a), LABELS.indexOf(b))] ?? "unlabeled";
};

export async function openR4({
  lock,
  spec,
  store = opfsStore(),
  grant = EMPTY_GRANT,
  mirror = null,
  boundary = null,
  decide = spec ? specDecider(spec) : null,
  workerUrl = new URL("./r4-worker.mjs", import.meta.url),
  onRequest,
}) {
  // The page serves every locked object as pieces; a mirror is used only when the grant admits it.
  const open = (entry) => openByFingerprint(store, entry, { base: mirror ?? OWN_OBJECTS, grant, onRequest });

  // 1. Engine bytes.
  const [glue, wasm] = [await open(lock.engine.glue), await open(lock.engine.wasm)];
  const engine = { state: worst(glue.state, wasm.state), reasons: [glue.reason, wasm.reason].filter(Boolean) };

  // 2. Worker.
  let worker = null;
  if (engine.state === "match") {
    worker = startWorker(workerUrl);
    try {
      await worker.call("init", { glue: glue.bytes, wasm: wasm.bytes, lock: lock.engine }, [glue.bytes.buffer, wasm.bytes.buffer]);
    } catch (error) {
      worker.stop();
      worker = null;
      engine.state = "mismatch";
      engine.reasons.push(String(error.message ?? error));
    }
  }

  // Weights for each in-Prism model, loaded on first use.
  const loaded = new Map();
  async function weightsFor(entry) {
    if (loaded.has(entry.id)) return loaded.get(entry.id);
    const opened = await open(entry);
    let result = { state: opened.state, reason: opened.reason, from: opened.from };
    if (opened.state === "match" && worker) {
      const status = await worker.call("load", { bytes: opened.bytes, label: `opfs:${entry.fingerprint}` }, [opened.bytes.buffer]);
      // The engine reports the digest of the pack it mounted. It must be the locked one.
      if (status.status === "error" || `sha256-${status.sha256}` !== entry.fingerprint) {
        result = { state: "mismatch", reason: "EngineMountedOtherBytes" };
      } else {
        result.status = status;
      }
    }
    loaded.set(entry.id, result);
    return result;
  }

  const compiled = new Map();
  const routes = new Map();
  let session = 0;

  if (typeof decide !== "function") throw new Refusal("NoDecision");

  async function decideWith(fields) {
    const line = decisionLine(fields);
    const { outcome, rule } = await decide(line);
    return { outcome, rule, line };
  }

  async function boundaryWord(context, text, detect, approval = "none") {
    if (typeof boundary !== "function") return "deny"; // no Boundary, nothing shown
    const detector = detect ? await detect(text) : "none";
    const line = [context.label, detector, "browser", approval, context.identifier ?? "no", context.halted ?? "no"].join(" ");
    return (await boundary(line)).trim();
  }

  // Run one answer through: pre-check, model, Boundary, final decision, receipt.
  async function settle({ mode, fields, model, route, prompt, context, detect, run }) {
    const pre = await decideWith({ ...fields, boundary: "allow" });
    if (pre.outcome !== "answer") {
      return { outcome: pre.outcome === "invalid" ? "refuse" : pre.outcome, answer: null,
        receipt: await makeReceipt({ mode, model, route, decision: pre, request: prompt, answerText: null }) };
    }
    const text = await run(prompt);
    session += 1;
    const word = await boundaryWord(context, text, detect);
    const final = await decideWith({ ...fields, boundary: word });
    const withHash = final.outcome === "answer" || final.outcome === "receipt" || final.outcome === "ask";
    const receipt = await makeReceipt({ mode, model, route, decision: final, request: prompt, answerText: withHash ? text : null });
    const result = { outcome: final.outcome, answer: final.outcome === "answer" ? text : null, receipt };
    if (final.outcome === "ask") {
      // The owner's OK goes back through the Boundary and the model; nothing is shown otherwise.
      result.release = async () => {
        const again = await boundaryWord(context, text, detect, "owner");
        const after = await decideWith({ ...fields, boundary: again });
        return { outcome: after.outcome, answer: after.outcome === "answer" ? text : null,
          receipt: await makeReceipt({ mode, model, route, decision: after, request: prompt, answerText: text }) };
      };
    }
    return result;
  }

  const r4Model = (entry) => ({ id: entry.id, schema: entry.schema, engine: lock.engine.wasm.fingerprint,
    glue: lock.engine.glue.fingerprint, weights: entry.fingerprint, session });

  return {
    engine: { state: engine.state, reasons: engine.reasons, fingerprint: lock.engine.wasm.fingerprint },

    // Mode 2: a model running in the Prism from its fingerprinted parameter blob.
    async ask({ prompt, model: id = lock.models.inprism[0]?.id, context = { label: "public" }, detect, maxTokens = 128 }) {
      const entry = lock.models.inprism.find((m) => m.id === id);
      if (!entry) throw new Refusal("UnknownModel", { id });
      const weights = engine.state === "match" ? await weightsFor(entry) : { state: "missing" };
      const ctx = { ...context, label: higherLabel(context.label ?? "unlabeled", entry.label) };
      return settle({
        mode: "inprism",
        fields: { mode: "inprism", engine: engine.state, weights: weights.state, route: "none" },
        model: r4Model(entry), route: null, prompt, context: ctx, detect,
        run: async (p) => {
          const reply = await worker.call("chat", { request: { model: entry.id, max_tokens: maxTokens, messages: [{ role: "user", content: p }] } });
          return reply?.choices?.[0]?.message?.content ?? "";
        },
      });
    },

    // Mode 1: a model compiled with Prism into the holo. The guest bytes must be locked.
    async registerCompiled({ id, guestBytes, dispatch }) {
      const entry = lock.models.compiled.find((m) => m.id === id);
      const actual = await fingerprint(guestBytes);
      compiled.set(id, { entry, dispatch, state: entry && entry.guest === actual ? "match" : "mismatch", actual });
    },
    async askCompiled({ id, prompt, context = { label: "public" }, detect }) {
      const c = compiled.get(id);
      if (!c) throw new Refusal("UnknownModel", { id });
      const weights = c.entry?.weights ? "match" : "none"; // a locked compiled entry with weights is refused by the model
      return settle({
        mode: "compiled",
        fields: { mode: "compiled", engine: c.state, weights, route: "none" },
        model: { id, guest: c.entry?.guest ?? c.actual }, route: null, prompt, context, detect,
        run: async (p) => new TextDecoder().decode(await c.dispatch(new TextEncoder().encode(p))),
      });
    },

    // Mode 3: another model R4 routes the request to. The route must be locked and granted.
    // A route is either locked in r4.lock.json (granted by origin) or a model routed into
    // the Prism (site/models), which carries the Prism Models decision that let it run.
    registerRoute({ id, run, entry = null }) {
      routes.set(id, { run, entry });
    },
    async askRouted({ target, prompt, context = { label: "public" }, detect }) {
      const registered = routes.get(target);
      const entry = lock.models.routed.find((m) => m.id === target) ?? registered?.entry ?? null;
      const granted = Boolean(entry && registered && (entry.origin ? admits(grant, entry.origin) : entry.decision === "run"));
      const weights = entry?.fingerprint ? (await open({ ...entry, path: entry.path })).state : "none";
      const router = { id: lock.engine.id, engine: lock.engine.wasm.fingerprint };
      return settle({
        mode: "routed",
        fields: { mode: "routed", engine: engine.state, weights, route: granted ? "granted" : "ungranted" },
        model: { id: target, ...(entry?.fingerprint ? { weights: entry.fingerprint } : {}), ...(entry?.source ? { source: entry.source, decision: entry.line } : {}) },
        route: { router, target: { id: target, origin: entry?.origin ?? null } },
        prompt, context: { ...context, identifier: context.identifier ?? "no" }, detect,
        run: async (p) => routes.get(target).run(p),
      });
    },

    stop() { worker?.stop(); },
  };
}

function worst(a, b) {
  if (a === "mismatch" || b === "mismatch") return "mismatch";
  if (a === "missing" || b === "missing") return "missing";
  return "match";
}

function startWorker(url) {
  const w = new Worker(url, { type: "module" });
  let next = 0;
  const waiting = new Map();
  w.onmessage = ({ data }) => {
    const p = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.ok) p.resolve(data.value); else p.reject(new Error(data.error));
  };
  w.onerror = (e) => { for (const p of waiting.values()) p.reject(new Error(e.message || "WorkerError")); waiting.clear(); };
  return {
    call(kind, payload, transfer = []) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        w.postMessage({ id, kind, ...payload }, transfer);
      });
    },
    stop() { w.terminate(); },
  };
}
