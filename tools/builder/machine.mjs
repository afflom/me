/**
 * A state machine's decision, owned by its states.
 *
 * In an OMG UML 2.5.1 behavioral state machine every transition has a source
 * vertex (section 14.2.3.8): the machine first finds the transitions of the
 * state it is in, then fires the first whose trigger and guard hold. A flat
 * first-match chain over every rule computes the same answer, but it asks the
 * prover to split one `if` per rule of the whole machine. Factored by source
 * state, `judge` tests the state once and hands the request to that state's own
 * chain, which holds only the rules that can fire from it, in their order.
 *
 * The answer is unchanged for every request: a rule left out of a state's chain
 * has a condition `state is t` with t another state, or `state is not s`, so it
 * cannot hold there; and the chain past the last state keeps exactly the rules
 * that name no state with `is`, for a state value no state has (the decoder
 * never yields one). The other declarations are prism-code's own, so the guest
 * and the proofs still come from one model.
 */
import { declarations, declarationText, names, proofDeclarations } from './vendor/prism-code/src/journey/render.mjs';

const pascal = (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Whether rule `r` can fire when the state field holds `value` (null: a value no state has). */
function canFire(r, field, value) {
  return r.when.every((c) => c.field !== field || (c.op === 'is' ? c.value === value : c.op === 'is not' ? c.value !== value : true));
}

/**
 * A rule whose `if` would leave `omega` a negated conjunction or a double
 * negation in its else branch. Lean's `omega` pushes those negations through
 * with `Classical.propDecidable` (Lean/Elab/Tactic/Omega/Frontend.lean,
 * `pushNot`), so the property proofs would depend on `Classical.choice`.
 */
const missable = (r) => r.when.length > 1 || r.when.some((c) => c.op === 'is not' || c.op === '!=');

/**
 * The rule's condition negated by De Morgan, written only with atoms and `||`:
 * `x is v` misses when `x < v || v < x` (every field is a natural number), and
 * `x is not v` misses when `x = v`. `omega` reads atoms, negated atoms, `||`
 * and a negated `||` constructively, so a chain that tests the miss first never
 * hands it a negation it must push classically.
 */
function missCondition(n, c) {
  const field = n.fields[c.field];
  const left = `(project request ${field.id})`;
  const right = c.op === 'is' || c.op === 'is not' ? `(${field.choices[c.value]})` : typeof c.value === 'object' ? `(project request ${n.fields[c.value.field].id})` : String(c.value);
  switch (c.op) {
    case 'is':
    case '=':
      return `((${left} <? ${right}) || (${right} <? ${left}))`;
    case 'is not':
    case '!=':
      return `(${left} =? ${right})`;
    case '<': return `(${right} <=? ${left})`;
    case '<=': return `(${right} <? ${left})`;
    case '>': return `(${left} <=? ${right})`;
    case '>=': return `(${left} <? ${right})`;
    default: throw new Error(`unknown op ${c.op}`);
  }
}

/** A table of this many rules or more is factored by a choice field when one shortens every chain. */
export const FACTOR_AT = 11;

/**
 * The choice field that factors a long decision table best: the one whose
 * longest chain (a value's rules, or the rules past every value) is shortest,
 * if that is shorter than the whole table. A first-match chain asks the prover
 * to split one `if` per rule, and Lean's `split` gives up near a dozen.
 */
export function factorField(spec) {
  if (spec.rules.length < FACTOR_AT) return null;
  let best = null;
  for (const f of spec.fields.filter((g) => g.kind === 'choice')) {
    const longest = Math.max(spec.rules.filter((r) => canFire(r, f.name, null)).length, ...f.values.map((v) => spec.rules.filter((r) => canFire(r, f.name, v)).length));
    if (longest < spec.rules.length && (!best || longest < best.longest)) best = { state: f.name, longest };
  }
  return best ? { state: best.state } : null;
}

/**
 * The decision as it is proved: a state machine's owned by its states, a long
 * table's factored by its best choice field, and every rule that would need a
 * classical negation tested by its miss first. The answer is prism-code's
 * first-match answer for every request.
 */
export function machineDeclarations(spec, machine, n = names(spec)) {
  const decls = declarations(spec, n);
  const at = decls.findIndex((d) => d.name === 'judge');
  const judge = decls[at];
  const taken = new Set(decls.map((d) => d.name));
  const claim = (base) => {
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
    taken.add(name);
    return name;
  };
  const misses = new Map();
  for (const r of spec.rules.filter(missable)) misses.set(r.id, claim(`${n.rules[r.id]}Misses`));
  const missDecls = spec.rules.filter(missable).map((r) => {
    const rule = decls.find((d) => d.name === n.rules[r.id]);
    return { ...rule, name: misses.get(r.id), body: r.when.map((c) => missCondition(n, c)).reduce((acc, t) => (acc ? `(${acc} || ${t})` : t), '') };
  });
  const chain = (rules) =>
    rules.reduceRight(
      (rest, r) => (misses.has(r.id) ? `(if (${misses.get(r.id)} request) then ${rest} else (${n.answers[r.then]}))` : `(if (${n.rules[r.id]} request) then (${n.answers[r.then]}) else ${rest})`),
      `(${n.answers[spec.otherwise]})`,
    );
  const owner = machine ?? factorField(spec);
  if (!owner) {
    return { decls: [...decls.slice(0, at), ...missDecls, { ...judge, body: chain(spec.rules) }, ...decls.slice(at + 1)], steps: [], misses: [...misses.values()], rest: spec.rules.map((r) => r.id), n };
  }
  const field = spec.fields.find((f) => f.name === owner.state);
  const steps = field.values.map((value) => ({ value, name: claim(`step${pascal(value)}`), rules: spec.rules.filter((r) => canFire(r, field.name, value)) }));
  const stateOf = `(project request ${n.fields[field.name].id})`;
  const rest = spec.rules.filter((r) => canFire(r, field.name, null));
  const body = steps.reduceRight((tail, s) => `(if (${stateOf} =? (${n.fields[field.name].choices[s.value]})) then (${s.name} request) else ${tail})`, chain(rest));
  const stepDecls = steps.map((s) => ({ ...judge, name: s.name, body: chain(s.rules) }));
  return {
    decls: [...decls.slice(0, at), ...missDecls, ...stepDecls, { ...judge, body }, ...decls.slice(at + 1)],
    steps: steps.map((s) => ({ value: s.value, name: s.name, rules: s.rules.map((r) => r.id) })),
    misses: [...misses.values()],
    rest: rest.map((r) => r.id),
    n,
  };
}

/** The proofs module's declarations: each theorem also unfolds the states' chains and the rules' misses. */
export function machineProofDeclarations(spec, machine, n = names(spec)) {
  const { steps, misses } = machineDeclarations(spec, machine, n);
  const q = (name) => `${n.module}::${name}`;
  return proofDeclarations(spec, n).map((d) => (d.kind === 'theorem' ? { ...d, unfold: [...new Set([...d.unfold, ...steps.map((s) => q(s.name)), ...misses.map(q)])].sort() } : d));
}

// The module text exactly as prism-code's renderer lays it out.
const moduleText = (name, imports, decls) =>
  [
    `\\begin{lexlean}{${name}}`,
    '\\useglossary{lexlean.std.bool@1.2.0}',
    '\\useglossary{lexlean.std.nat@1.2.0}',
    '\\useglossary{prism.arch@1.0.0}',
    ...imports.map((m) => `\\importmodule{${m}}`),
    '\\title{Text application model}',
    '\\begin{semanticmodule}',
    decls.map(declarationText).join('\n\n'),
    '\\end{semanticmodule}',
    '\\end{lexlean}',
    '',
  ].join('\n');

const withAxioms = (decls, axioms) => decls.map((d) => (Object.hasOwn(axioms, d.name) ? { ...d, axioms: axioms[d.name] } : d));

export function renderMachineModel(spec, machine, { axioms = {} } = {}) {
  const n = names(spec);
  return moduleText(n.module, ['Foundation.Bytes', 'Foundation.View.Text.V1.Model'], withAxioms(machineDeclarations(spec, machine, n).decls, axioms));
}

export function renderMachineProofs(spec, machine, { axioms = {} } = {}) {
  const n = names(spec);
  if (spec.properties.length === 0) return null;
  return moduleText(n.proofs, [n.module], withAxioms(machineProofDeclarations(spec, machine, n), axioms));
}
