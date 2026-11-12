// MD-01 in headless Chromium. Runs in the page; results land on window.__models.
// Each scenario is named for the gate it shows, and the planted defects are marked PLANTED.
import { openModels, modelLine, EMPTY_MODEL_GRANT } from "../../site/models/models.mjs";
import { openR4 } from "../../site/r4/r4.mjs";
import { specDecider } from "../../site/r4/decide.mjs";
import { opfsStore } from "../../site/r4/store.mjs";
import { verifyReceipt } from "../../site/r4/receipt.mjs";

const BAD = new URLSearchParams(location.search).get("bad"); // the same pieces, one byte flipped (PLANTED)
const json = async (u) => (await fetch(u)).json();
const lock = await json("../../site/models/models.lock.json");
const spec = await json("../../app/specs/models/spec.json");
const r4lock = await json("../../site/r4/r4.lock.json");
const r4spec = await json("../../app/specs/r4/spec.json");
const boundarySpec = await json("../../app/specs/boundary/spec.json");
// Every decision is the Prism's own model, applied from its spec, never a stub.
const decide = specDecider(spec);
const boundaryDecide = specDecider(boundarySpec);
const boundary = (line) => boundaryDecide(line).outcome;

const GEN = "smollm2-135m-instruct";
const EMB = "all-minilm-l6-v2";
const GRANT = { models: [GEN, EMB] };
const store = opfsStore();
const clone = (x) => JSON.parse(JSON.stringify(x));
const results = [];
const log = (name, pass, detail = {}) => { console.log(`${pass ? "pass" : "fail"} ${name}`); results.push({ name, pass: Boolean(pass), detail }); };
let requests = 0;
const onRequest = () => { requests += 1; };
const timed = async (f) => { const t = performance.now(); const v = await f(); return [v, Math.round(performance.now() - t)]; };
const piecesOf = (ids) => {
  const models = lock.models.filter((m) => ids.includes(m.id));
  const runtimes = [...new Set(models.flatMap((m) => m.runtimes))].map((id) => lock.runtimes.find((r) => r.id === id));
  return [...runtimes, ...models].flatMap((o) => o.files).reduce((n, f) => n + f.pieces.length, 0);
};
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

try {
  for (const n of await store.list()) await store.remove(n);

  // S1: the empty grant routes nothing: the decision asks the owner and nothing moves.
  requests = 0;
  const m0 = await openModels({ lock, decide, store, grant: EMPTY_MODEL_GRANT, onRequest });
  const d0 = await m0.prepare(GEN);
  log("S1 empty grant: ask the owner, fetch nothing", d0.outcome === "ask" && requests === 0 && m0.route("text-generation") === null, { d0, requests });

  // S2: halted: refuse even with the grant, and nothing moves.
  const mh = await openModels({ lock, decide, store, grant: GRANT, halted: () => "yes", onRequest });
  const dh = await mh.prepare(GEN);
  log("S2 halted: refuse, fetch nothing", dh.outcome === "refuse" && requests === 0, { dh, requests });

  // S3: first open with the grant: fetch the locked pieces, keep by fingerprint, then run.
  requests = 0;
  const m1 = await openModels({ lock, decide, store, grant: GRANT, onRequest, onProgress: (p) => console.log("progress", JSON.stringify(p)) });
  const before = await m1.judge(GEN);
  const [d1, prepMs] = await timed(() => m1.prepare(GEN));
  const [text, genMs] = await timed(() => m1.generate(GEN, "Say hello in one short sentence.", { maxTokens: 24 }));
  log("S3 first open: fetch by decision, keep by fingerprint, run SmolLM2 (ONNX) locally",
    before.outcome === "fetch" && before.line === "locked onnx missing missing granted no" &&
    d1.outcome === "run" && d1.line === "locked onnx match match granted no" &&
    requests === piecesOf([GEN]) && typeof text === "string" && text.trim().length > 0,
    { before: before.line, after: d1.line, requests, expected: piecesOf([GEN]), prepMs, genMs, text: text?.slice(0, 200) });

  // S4: embeddings from a second model on the same runtime (no new runtime pieces).
  requests = 0;
  const d2 = await m1.prepare(EMB);
  const [v] = [await m1.embed(EMB, ["The meeting moved to Tuesday.", "Our call is now on Tuesday.", "Bananas are yellow."])];
  const near = cosine(v[0], v[1]);
  const far = cosine(v[0], v[2]);
  const embPieces = lock.models.find((m) => m.id === EMB).files.reduce((n, f) => n + f.pieces.length, 0);
  log("S4 embeddings (all-MiniLM-L6-v2): related texts are nearer than unrelated",
    d2.outcome === "run" && v[0].length === 384 && near > far + 0.2 && requests === embPieces,
    { line: d2.line, dims: v[0]?.length, near, far, requests, embPieces });

  // S5: R4 routes the request; the answer is shown only through R4's routed mode and the Boundary.
  const r4 = await openR4({ lock: r4lock, spec: r4spec, store, boundary });
  m1.connect(r4, { maxTokens: 24 });
  const target = m1.route("text-generation");
  const routed = await r4.askRouted({ target, prompt: "Name one color.", context: { label: "public" } });
  const ok = await verifyReceipt(routed.receipt, routed.answer);
  const confidential = await r4.askRouted({ target, prompt: "Name one color.", context: { label: "confidential" } });
  const unrouted = await r4.askRouted({ target: "not-a-model", prompt: "Name one color." });
  log("S5 routed by R4: answer with a routed receipt; the Boundary still decides what shows",
    r4.engine.state === "match" && target === GEN && routed.outcome === "answer" && routed.answer.length > 0 && ok.ok &&
    routed.receipt.mode === "routed" && routed.receipt.model.id === GEN && routed.receipt.model.source.revision === lock.models[0].source.revision &&
    routed.receipt.decision.line === "routed match none granted allow" &&
    confidential.outcome !== "answer" && unrouted.outcome === "refuse",
    { engine: r4.engine.state, answer: routed.answer?.slice(0, 120), receipt: routed.receipt, confidential: confidential.outcome, unrouted: unrouted.outcome });
  r4.stop();

  // S6: withdrawing the grant or halting stops the next call; the decision is asked every time.
  const mw = await openModels({ lock, decide, store, grant: GRANT, onRequest });
  await mw.prepare(GEN);
  let halt = "no";
  const ms = await openModels({ lock, decide, store, grant: GRANT, halted: () => halt });
  await ms.prepare(GEN);
  halt = "yes";
  let stopped = null;
  try { await ms.generate(GEN, "hi", { maxTokens: 4 }); } catch (e) { stopped = e.code; }
  log("S6 halting after load stops the next call", stopped === "ModelMayNotRun", { stopped });
  mw.stop(); ms.stop();

  // S7: a second open comes from OPFS by fingerprint, with no request.
  m1.stop();
  requests = 0;
  const m2 = await openModels({ lock, decide, store, grant: GRANT, onRequest });
  const d7 = await m2.prepare(GEN);
  const t7 = await m2.generate(GEN, "Say hi.", { maxTokens: 8 });
  log("S7 second open from OPFS, no network", d7.outcome === "run" && requests === 0 && t7.length > 0, { line: d7.line, requests });
  m2.stop();

  // S8 PLANTED: a stored weight file changes on disk: refuse, then fetch it again.
  const model = lock.models.find((m) => m.id === GEN);
  const weights = model.files.find((f) => f.path.endsWith(".onnx"));
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(store.directory);
  const w = await (await dir.getFileHandle(weights.fingerprint)).createWritable({ keepExistingData: true });
  await w.write({ type: "write", position: 1000, data: new Uint8Array([0x42, 0x42]) });
  await w.close();
  const m3 = await openModels({ lock, decide, store, grant: GRANT });
  const d8 = await m3.judge(GEN);
  const d8b = await m3.judge(GEN);
  log("S8 PLANTED tampered weights in OPFS: refuse, then fetch again", d8.outcome === "refuse" && d8.fields.weights === "mismatch" && d8b.outcome === "fetch",
    { first: d8.line, then: d8b.line });

  // S9 PLANTED: the server flips a byte in each piece: the fetch is refused and nothing runs.
  const m4 = await openModels({ lock, decide, store, grant: GRANT, base: new URL(BAD) });
  const d9 = await m4.prepare(GEN);
  log("S9 PLANTED flipped bytes in transit: never run", d9.outcome !== "run" && d9.fields.weights !== "match", { line: d9.line, outcome: d9.outcome });

  // S10 PLANTED: an unpinned revision, an unpinned file, an unknown format: refuse.
  const unpinned = clone(lock); unpinned.models[0].source.revision = "main";
  const lostFile = clone(lock); delete lostFile.models[0].files[0].fingerprint;
  const otherFormat = clone(lock); otherFormat.models[0].format = "safetensors";
  const outs = [];
  for (const l of [unpinned, lostFile, otherFormat]) outs.push(await (await openModels({ lock: l, decide, store, grant: GRANT })).judge(GEN));
  log("S10 PLANTED unpinned revision, unpinned file, unknown format: refuse",
    outs.every((o) => o.outcome === "refuse") && outs[0].fields.source === "unlocked" && outs[2].fields.format === "other",
    { lines: outs.map((o) => `${o.line} -> ${o.outcome}`) });

  // S11 PLANTED: without the Prism's decision nothing opens.
  let nodecision = null;
  try { await openModels({ lock, store, grant: GRANT }); } catch (e) { nodecision = e.code; }
  log("S11 PLANTED no decision: nothing opens", nodecision === "NoDecision", { nodecision });

  // S12: the decision line is the model's field order.
  log("S12 request line order", modelLine({ source: "locked", format: "onnx", runtime: "match", weights: "match", route: "granted", halted: "no" }) === "locked onnx match match granted no");
} catch (error) {
  log("harness", false, { error: String(error?.stack ?? error) });
}
window.__models = results;
