// One receipt per answer. A receipt names the mode and the model that produced the answer,
// the exact bytes that ran, the decision and the rule that made it, and the hashes of the
// request and the answer. It never holds the request or answer text, so a receipt can be
// kept or shown even where the answer itself may not be.
//
// The three modes stay apart by shape:
//   compiled  a model compiled with Prism into the holo. Names the guest; carries no weights, no route.
//   inprism   a model running in the Prism from a fingerprinted parameter blob. Names engine + weights; no route.
//   routed    another model that R4 routed the request to. Names R4 as router and the target model.
import { canonical, fingerprint, fingerprintText, FINGERPRINT, Refusal } from "./fingerprint.mjs";

export const RECEIPT_SCHEMA = "me/r4-receipt/1";
export const MODES = Object.freeze(["compiled", "inprism", "routed"]);

const fp = (v) => typeof v === "string" && FINGERPRINT.test(v);

// Shape rules, one per mode. A receipt that mixes modes is refused before it exists.
export function checkShape(r) {
  if (r.schema !== RECEIPT_SCHEMA) return "BadSchema";
  if (!MODES.includes(r.mode)) return "UnknownMode";
  if (!fp(r.request)) return "BadRequestHash";
  if (r.answer !== null && !fp(r.answer)) return "BadAnswerHash";
  if (r.mode === "compiled") {
    if (!r.model?.guest || !r.model?.id) return "CompiledNeedsGuest";
    if (r.model.weights !== undefined || r.route !== null) return "CompiledCarriesNoWeightsOrRoute";
  }
  if (r.mode === "inprism") {
    if (!r.model?.engine || !r.model?.weights || !r.model?.id) return "InPrismNeedsEngineAndWeights";
    if (r.model.guest !== undefined || r.route !== null) return "InPrismIsNotRouted";
  }
  if (r.mode === "routed") {
    if (!r.route?.router?.engine || !r.route?.target?.id) return "RoutedNeedsRouterAndTarget";
    if (r.route.target.id === r.route.router.id) return "RouterIsNotTheTarget";
    if (r.model?.id !== r.route.target.id) return "RoutedModelIsTheTarget";
  }
  return null;
}

export async function makeReceipt({ mode, model, route = null, decision, request, answerText }) {
  const body = {
    schema: RECEIPT_SCHEMA,
    mode,
    model,
    route,
    decision: { outcome: decision.outcome, rule: decision.rule, line: decision.line },
    request: await fingerprintText(request),
    answer: answerText == null ? null : await fingerprintText(answerText),
  };
  const problem = checkShape(body);
  if (problem) throw new Refusal(problem);
  return { ...body, address: await fingerprintText(canonical(body)) };
}

// Re-derive a receipt's address; optionally check it against the answer text a page shows.
export async function verifyReceipt(receipt, answerText) {
  const { address, ...body } = receipt;
  const problem = checkShape(body);
  if (problem) return { ok: false, reason: problem };
  if (address !== (await fingerprintText(canonical(body)))) return { ok: false, reason: "AddressMismatch" };
  if (answerText !== undefined && body.answer !== (await fingerprintText(answerText))) {
    return { ok: false, reason: "AnswerMismatch" };
  }
  return { ok: true };
}

export { fingerprint };
