// R4-01 in headless Chromium. Runs in the page; results land on window.__r4.
// Each scenario is named for the gate it shows, and the planted defects are marked PLANTED.
import { openR4 } from "../../site/r4/r4.mjs";
import { specDecider } from "../../site/r4/decide.mjs";
import { opfsStore } from "../../site/r4/store.mjs";
import { verifyReceipt, checkShape } from "../../site/r4/receipt.mjs";
import { EMPTY_GRANT } from "../../site/r4/grant.mjs";
import { fingerprint } from "../../site/r4/fingerprint.mjs";

const params = new URLSearchParams(location.search);
const MIRROR = params.get("mirror");        // a second origin serving the same pieces
const BAD = params.get("bad");              // the same pieces, weights with one byte flipped (PLANTED)
const MIRROR_ORIGIN = new URL(MIRROR).origin;
const GRANT = { origins: [MIRROR_ORIGIN] };

const json = async (u) => (await fetch(u)).json();
const lock = await json("../../site/r4/r4.lock.json");
const spec = await json("../../app/specs/r4/spec.json");
const boundarySpec = await json("../../app/specs/boundary/spec.json");
// The Boundary is the Prism's own model, applied from its spec, never a stub that always allows.
const boundaryDecide = specDecider(boundarySpec);
const boundary = (line) => boundaryDecide(line).outcome;

const store = opfsStore();
const clone = (x) => JSON.parse(JSON.stringify(x));
const results = [];
const log = (name, pass, detail = {}) => results.push({ name, pass: Boolean(pass), detail });

let requests = 0;
const counted = { onRequest: () => { requests += 1; } };
const timed = async (f) => { const t = performance.now(); const v = await f(); return [v, Math.round(performance.now() - t)]; };

async function clearStore() { for (const n of await store.list()) await store.remove(n); }

try {
  await clearStore();

  // S1: first open fetches the pieces this page serves, stores by fingerprint, answers with a receipt.
  const pieces = [lock.engine.glue, lock.engine.wasm, ...lock.models.inprism].reduce((n, e) => n + e.pieces.length, 0);
  requests = 0;
  const [r1, openMs] = await timed(() => openR4({ lock, spec, store, grant: EMPTY_GRANT, boundary, ...counted }));
  const [a1, askMs] = await timed(() => r1.ask({ prompt: "Hello! What can you do?" }));
  const v1 = await verifyReceipt(a1.receipt, a1.answer);
  const stored = await store.list();
  log("S1 first open: fetch by grant, store by fingerprint, answer with receipt",
    r1.engine.state === "match" && a1.outcome === "answer" && a1.answer.length > 0 && v1.ok &&
    a1.receipt.mode === "inprism" && a1.receipt.model.weights === lock.models.inprism[0].fingerprint &&
    stored.length === 3 && requests === pieces && pieces > 3,
    { openMs, askMs, requests, pieces, stored, answer: a1.answer.slice(0, 160), receipt: a1.receipt });
  r1.stop();

  // S2: second open with the empty grant: everything comes from OPFS, zero requests.
  requests = 0;
  const [r2, open2Ms] = await timed(() => openR4({ lock, spec, store, grant: EMPTY_GRANT, mirror: MIRROR, boundary, ...counted }));
  const a2 = await r2.ask({ prompt: "What is two plus three?" });
  log("S2 offline open from OPFS by fingerprint, empty grant, no network",
    a2.outcome === "answer" && requests === 0 && (await verifyReceipt(a2.receipt, a2.answer)).ok,
    { open2Ms, requests, answer: a2.answer?.slice(0, 160) });
  r2.stop();

  // S3 PLANTED: flip one byte of the stored weights in OPFS. Restore must refuse them.
  const wfp = lock.models.inprism[0].fingerprint;
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(store.directory);
  {
    const h = await dir.getFileHandle(wfp);
    const bytes = new Uint8Array(await (await h.getFile()).arrayBuffer());
    bytes[4096] ^= 0x01;
    const w = await h.createWritable(); await w.write(bytes); await w.close();
  }
  const r3 = await openR4({ lock, spec, store, grant: EMPTY_GRANT, mirror: MIRROR, boundary });
  const a3 = await r3.ask({ prompt: "Hello" });
  log("S3 PLANTED tampered weights in OPFS are refused and removed",
    a3.outcome === "refuse" && a3.receipt.decision.rule === "REQ-002" && a3.answer === null &&
    a3.receipt.answer === null && !(await store.list()).includes(wfp),
    { decision: a3.receipt.decision });
  r3.stop();

  // S4 PLANTED: the lock names a different weights fingerprint than the bytes served.
  const lock4 = clone(lock);
  lock4.models.inprism[0].fingerprint = wfp.slice(0, -1) + (wfp.endsWith("0") ? "1" : "0");
  const r4b = await openR4({ lock: lock4, spec, store, grant: GRANT, mirror: MIRROR, boundary });
  const a4 = await r4b.ask({ prompt: "Hello" });
  log("S4 PLANTED wrong weight bytes for the lock are refused and never stored",
    a4.outcome === "refuse" && a4.receipt.decision.rule === "REQ-002" && !(await store.list()).includes(lock4.models.inprism[0].fingerprint),
    { decision: a4.receipt.decision });
  r4b.stop();

  // S5 PLANTED: a source serves weights with one byte flipped in transit.
  const r5 = await openR4({ lock, spec, store, grant: { origins: [MIRROR_ORIGIN, new URL(BAD).origin] }, mirror: BAD, boundary });
  const a5 = await r5.ask({ prompt: "Hello" });
  log("S5 PLANTED flipped bytes from the network are refused and never stored",
    a5.outcome === "refuse" && a5.receipt.decision.rule === "REQ-002" && !(await store.list()).includes(wfp),
    { decision: a5.receipt.decision, engine: r5.engine.state });
  r5.stop();

  // S6: refetch with the grant restores the weights; the store heals.
  const r6 = await openR4({ lock, spec, store, grant: GRANT, mirror: MIRROR, boundary });
  const a6 = await r6.ask({ prompt: "Hello" });
  log("S6 refetch by grant restores the weights", a6.outcome === "answer" && (await store.list()).includes(wfp), {});

  // S7: Boundary words reach the outcome. Restricted -> hashonly -> receipt only; halted -> refuse; no Boundary -> refuse.
  const a7 = await r6.ask({ prompt: "Hello", context: { label: "restricted" } });
  const a7b = await r6.ask({ prompt: "Hello", context: { label: "public", halted: "yes" } });
  const a7c = await r6.ask({ prompt: "Hello", context: { label: "confidential" } });
  log("S7 Boundary: restricted shows only the receipt, halted refuses",
    a7.outcome === "receipt" && a7.answer === null && a7.receipt.answer !== null && a7.receipt.decision.rule === "REQ-011" &&
    a7b.outcome === "refuse" && a7b.receipt.decision.rule === "REQ-009" &&
    a7c.outcome === "answer",
    { a7: a7.receipt.decision, a7b: a7b.receipt.decision, a7c: a7c.receipt.decision });
  r6.stop();
  const r7 = await openR4({ lock, spec, store, grant: EMPTY_GRANT, mirror: MIRROR /* no boundary */ });
  const a7d = await r7.ask({ prompt: "Hello" });
  log("S7b no Boundary means nothing is shown", a7d.outcome === "refuse" && a7d.receipt.decision.rule === "REQ-009", {});

  // S8: the three modes stay apart.
  const guestBytes = new TextEncoder().encode("synthetic compiled guest for tests");
  const guestFp = await fingerprint(guestBytes);
  const lock8 = clone(lock);
  lock8.models.compiled = [{ id: "echo-compiled", guest: guestFp }, { id: "bad-compiled", guest: guestFp, weights: wfp }];
  lock8.models.routed = [{ id: "test-routed", origin: MIRROR_ORIGIN }];
  const r8 = await openR4({ lock: lock8, spec, store, grant: GRANT, mirror: MIRROR, boundary });
  await r8.registerCompiled({ id: "echo-compiled", guestBytes, dispatch: (b) => b });
  await r8.registerCompiled({ id: "bad-compiled", guestBytes, dispatch: (b) => b });
  await r8.registerCompiled({ id: "forged-compiled", guestBytes: new Uint8Array([1, 2, 3]), dispatch: (b) => b });
  r8.registerRoute({ id: "test-routed", run: async (p) => `routed reply to ${p.length} chars` });
  r8.registerRoute({ id: "unlocked-target", run: async () => "should never show" });
  const m1 = await r8.askCompiled({ id: "echo-compiled", prompt: "ping" });
  const m1b = await r8.askCompiled({ id: "bad-compiled", prompt: "ping" });
  const m1c = await r8.askCompiled({ id: "forged-compiled", prompt: "ping" });
  const m2 = await r8.ask({ prompt: "ping" });
  const m3 = await r8.askRouted({ target: "test-routed", prompt: "ping" });
  const m3b = await r8.askRouted({ target: "unlocked-target", prompt: "ping" });
  const r8b = await openR4({ lock: lock8, spec, store, grant: EMPTY_GRANT, mirror: MIRROR, boundary });
  r8b.registerRoute({ id: "test-routed", run: async () => "should never show" });
  const m3c = await r8b.askRouted({ target: "test-routed", prompt: "ping" });
  log("S8 modes: compiled, in-Prism and routed answers each name their mode and model",
    m1.outcome === "answer" && m1.receipt.mode === "compiled" && m1.receipt.model.guest === guestFp && m1.receipt.model.weights === undefined &&
    m2.outcome === "answer" && m2.receipt.mode === "inprism" && m2.receipt.route === null &&
    m3.outcome === "answer" && m3.receipt.mode === "routed" && m3.receipt.route.router.id === "lexlean-r4-wasm" && m3.receipt.model.id === "test-routed",
    { m1: m1.receipt, m3: m3.receipt });
  log("S8b PLANTED a compiled model with a weights blob, a forged guest, an unlocked or ungranted route are refused",
    m1b.outcome === "refuse" && m1b.receipt.decision.rule === "REQ-003" &&
    m1c.outcome === "refuse" && m1c.receipt.decision.rule === "REQ-001" &&
    m3b.outcome === "refuse" && m3b.receipt.decision.rule === "REQ-007" &&
    m3c.outcome === "refuse" && m3c.receipt.decision.rule === "REQ-007",
    { m1b: m1b.receipt.decision, m1c: m1c.receipt.decision, m3b: m3b.receipt.decision, m3c: m3c.receipt.decision });
  r8.stop(); r8b.stop();

  // S10: every served piece is within the limit, and a piece larger than its lock says is refused (PLANTED).
  const all = [lock.engine.glue, lock.engine.wasm, ...lock.models.inprism].flatMap((e) => e.pieces);
  const lock10 = clone(lock);
  lock10.models.inprism[0].fingerprint = "sha256-" + "1".repeat(64);
  lock10.models.inprism[0].pieces[0].bytes -= 1;
  const r10 = await openR4({ lock: lock10, spec, store, grant: EMPTY_GRANT, boundary });
  const a10 = await r10.ask({ prompt: "Hello" });
  log("S10 pieces are at most the limit; PLANTED a piece larger than locked is refused",
    all.every((p) => p.bytes <= lock.pieceBytes) && lock.pieceBytes <= lock.limitBytes &&
    a10.outcome === "refuse" && a10.receipt.decision.rule === "REQ-002",
    { decision: a10.receipt.decision, limit: lock.limitBytes, piece: lock.pieceBytes });
  r10.stop();

  // S11 PLANTED: a mirror the grant does not admit is never asked.
  requests = 0;
  const lock11 = clone(lock);
  lock11.models.inprism[0].fingerprint = "sha256-" + "2".repeat(64);
  const r11 = await openR4({ lock: lock11, spec, store, grant: EMPTY_GRANT, mirror: MIRROR, boundary, ...counted });
  const a11 = await r11.ask({ prompt: "Hello" });
  log("S11 PLANTED an ungranted mirror is never fetched from",
    a11.outcome === "refuse" && a11.receipt.decision.rule === "REQ-005" && requests === 0, { decision: a11.receipt.decision });
  r11.stop();

  // S9 PLANTED: receipts cannot be edited or made to mix modes.
  const forged = { ...a1.receipt, mode: "routed" };
  const swapped = { ...a1.receipt };
  const { address, ...body } = a1.receipt;
  log("S9 PLANTED an edited receipt, a mode-mixing receipt, or a different answer fail verification",
    !(await verifyReceipt(forged)).ok &&
    (await verifyReceipt({ ...swapped, request: "sha256-" + "0".repeat(64) })).reason === "AddressMismatch" &&
    (await verifyReceipt(a1.receipt, a1.answer + " ")).reason === "AnswerMismatch" &&
    checkShape({ ...body, route: { router: { id: "x", engine: "y" }, target: { id: "z" } } }) === "InPrismIsNotRouted",
    { forged: (await verifyReceipt(forged)).reason });
} catch (error) {
  log("harness error", false, { error: String(error?.stack ?? error) });
}

window.__r4 = results;
document.body.textContent = JSON.stringify(results.map((r) => [r.pass ? "PASS" : "FAIL", r.name]), null, 1);
