// The decision comes from the model, not from this file.
//
// The Prism R4 decision is app/src/PrismR4.lex.tex (7 guarantees, proved with
// only Quot.sound and propext). The Prism root compiles it into the page's wasm
// guest under the facet keyword "r4", and `guestDecider(dispatch)` asks that
// guest. `specDecider` reads the same model's rules from app/specs/r4/spec.json
// and applies them in order, first match decides; the tests use it to show the
// spec and the guest agree on every example. It holds no rule of its own.

export function specDecider(spec) {
  const fields = spec.fields;
  return function decide(line) {
    const words = line.trim().split(/\s+/);
    if (words.length !== fields.length) return { outcome: "invalid", rule: null };
    const request = {};
    for (let i = 0; i < fields.length; i += 1) {
      if (!fields[i].values.includes(words[i])) return { outcome: "invalid", rule: null };
      request[fields[i].name] = words[i];
    }
    for (const rule of spec.rules) {
      if (rule.when.every((c) => holds(request, c))) return { outcome: rule.then, rule: rule.id };
    }
    return { outcome: spec.otherwise, rule: "otherwise" };
  };
}

function holds(request, { field, op, value }) {
  if (op === "is") return request[field] === value;
  if (op === "is not") return request[field] !== value;
  throw new Error(`unsupported op ${op} for a choice field`);
}

// A decider backed by the compiled guest: dispatch(bytes) -> bytes. The Prism
// root routes "r4 <line>" to PrismR4's r4Dispatch; a guest without a root
// (the module alone) takes the line with `facet: null`.
export function guestDecider(dispatch, { facet = "r4" } = {}) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return async function decide(line) {
    const out = dec.decode(await dispatch(enc.encode(facet ? `${facet} ${line}` : line))).trim();
    return { outcome: out, rule: "guest" };
  };
}

// The request line, in the model's field order: mode engine weights route boundary.
export const decisionLine = ({ mode, engine, weights, route, boundary }) =>
  [mode, engine, weights, route, boundary].join(" ");
