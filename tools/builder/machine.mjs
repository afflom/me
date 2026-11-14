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

/**
 * The deepest `if` nesting the property proofs split. The fixed
 * `linear_arithmetic` script unfolds the whole decision into one goal and runs
 * `repeat' split`; Lean's `split` simplifies the goal at every step and gives up
 * (simp's step limit) once the `if`s nest past a dozen, measured on the locked
 * SDK's Lean (13 nested `if`s split, 14 do not). A decision deeper than this is
 * factored by choice fields until no path is.
 */
export const MAX_DEPTH = 12;

/**
 * The longest chain of rule tests one branch keeps. A rule's test can be a
 * disjunction of misses, which costs `split` more than a dispatch atom: a
 * 12-rule chain of compound misses does not split where 12 dispatch atoms do.
 */
export const MAX_CHAIN = 10;

/** A rule with the conditions on `fixed` fields dropped: inside that branch they hold. */
const specialize = (r, fixed) => ({ ...r, when: r.when.filter((c) => !fixed.has(c.field)), whole: r.whole ?? r });

/** The rules a chain tests: up to the first that always fires there, which answers the rest. */
function truncate(rules) {
  const at = rules.findIndex((r) => r.when.length === 0);
  return at < 0 ? { tests: rules, last: null } : { tests: rules.slice(0, at), last: rules[at] };
}

/**
 * The choice field that factors a too-deep decision best: the one whose deepest
 * branch (the tests to reach a value's chain plus that chain, or past every
 * value) is shallowest, if that is shallower than the chain itself.
 */
function bestField(spec, rules, fixed) {
  let best = null;
  for (const f of spec.fields.filter((g) => g.kind === 'choice' && !fixed.has(g.name))) {
    const sub = (v) => truncate(rules.filter((r) => canFire(r, f.name, v)).map((r) => specialize(r, new Set([f.name])))).tests.length;
    const depth = Math.max(f.values.length + sub(null), ...f.values.map((v, i) => i + 1 + sub(v)));
    if (!best || depth < best.depth) best = { field: f.name, depth };
  }
  return best && best.depth < truncate(rules).tests.length ? best.field : null;
}

/** Kept for callers that ask which field a table is factored by first. */
export function factorField(spec) {
  const field = truncate(spec.rules).tests.length > MAX_CHAIN ? bestField(spec, spec.rules, new Set()) : null;
  return field ? { state: field } : null;
}

/** A condition that holds, as an atom (the rule's own name is used when it is unchanged). */
function holdCondition(n, c) {
  const field = n.fields[c.field];
  const left = `(project request ${field.id})`;
  const right = c.op === 'is' || c.op === 'is not' ? `(${field.choices[c.value]})` : typeof c.value === 'object' ? `(project request ${n.fields[c.value.field].id})` : String(c.value);
  switch (c.op) {
    case 'is':
    case '=':
      return `(${left} =? ${right})`;
    case '<': return `(${left} <? ${right})`;
    case '<=': return `(${left} <=? ${right})`;
    case '>': return `(${right} <? ${left})`;
    case '>=': return `(${right} <=? ${left})`;
    default: throw new Error(`no atom holds for ${c.op}`);
  }
}

/**
 * The decision as it is proved: a state machine's owned by its states, a deep
 * table's factored by choice fields until no path nests past MAX_DEPTH, and
 * every rule that would need a classical negation tested by its miss first.
 * Inside a branch the conditions on the fields it fixed are dropped, and a rule
 * left with none answers the rest of its chain. The answer is prism-code's
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
  const or = (terms) => terms.reduce((acc, t) => (acc ? `(${acc} || ${t})` : t), '');
  const chain = (rules) => {
    const { tests, last } = truncate(rules);
    return tests.reduceRight((rest, r) => {
      const whole = r.whole ?? r;
      const answer = `(${n.answers[r.then]})`;
      if (r.when.length === whole.when.length) return misses.has(r.id) ? `(if (${misses.get(r.id)} request) then ${rest} else ${answer})` : `(if (${n.rules[r.id]} request) then ${answer} else ${rest})`;
      return missable(r) ? `(if ${or(r.when.map((c) => missCondition(n, c)))} then ${rest} else ${answer})` : `(if ${holdCondition(n, r.when[0])} then ${answer} else ${rest})`;
    }, `(${n.answers[last ? last.then : spec.otherwise]})`);
  };
  const stepDecls = [];
  // One branch per value of the field, its own chain or factored again; the chain past every value holds the rules that name no value with `is`.
  const factor = (rules, fixed, prefix, field, budget) => {
    const f = spec.fields.find((g) => g.name === field);
    const inner = new Set([...fixed, field]);
    const steps = f.values.map((value, i) => {
      const name = claim(`step${prefix}${pascal(value)}`);
      const sub = rules.filter((r) => canFire(r, field, value)).map((r) => specialize(r, inner));
      stepDecls.push({ ...judge, name, body: build(sub, inner, `${prefix}${pascal(value)}`, budget - i - 1) });
      return { value, name, rules: rules.filter((r) => canFire(r, field, value)).map((r) => r.whole ?? r) };
    });
    const rest = rules.filter((r) => canFire(r, field, null));
    const stateOf = `(project request ${n.fields[field].id})`;
    const body = steps.reduceRight((tail, s) => `(if (${stateOf} =? (${n.fields[field].choices[s.value]})) then (${s.name} request) else ${tail})`, chain(rest));
    return { body, steps, rest };
  };
  const build = (rules, fixed, prefix, budget) => {
    if (truncate(rules).tests.length <= Math.min(budget, MAX_CHAIN)) return chain(rules);
    const field = bestField(spec, rules, fixed);
    return field ? factor(rules, fixed, prefix, field, budget).body : chain(rules);
  };
  const owner = machine?.state ?? factorField(spec)?.state;
  if (!owner) {
    return { decls: [...decls.slice(0, at), ...missDecls, { ...judge, body: chain(spec.rules) }, ...decls.slice(at + 1)], steps: [], stepNames: [], misses: [...misses.values()], rest: spec.rules.map((r) => r.id), n };
  }
  const { body, steps, rest } = factor(spec.rules, new Set(), '', owner, MAX_DEPTH);
  return {
    decls: [...decls.slice(0, at), ...missDecls, ...stepDecls, { ...judge, body }, ...decls.slice(at + 1)],
    steps: steps.map((s) => ({ value: s.value, name: s.name, rules: s.rules.map((r) => r.id) })),
    stepNames: stepDecls.map((d) => d.name),
    misses: [...misses.values()],
    rest: rest.map((r) => r.id),
    n,
  };
}

/** The proofs module's declarations: each theorem also unfolds the states' chains and the rules' misses. */
export function machineProofDeclarations(spec, machine, n = names(spec)) {
  const { stepNames, misses } = machineDeclarations(spec, machine, n);
  const q = (name) => `${n.module}::${name}`;
  return proofDeclarations(spec, n).map((d) => (d.kind === 'theorem' ? { ...d, unfold: [...new Set([...d.unfold, ...stepNames.map(q), ...misses.map(q)])].sort() } : d));
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
