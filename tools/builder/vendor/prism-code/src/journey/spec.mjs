/**
 * The Prism spec (`prism/spec/1`): what a decision app does, in the words a
 * user gives it. One spec renders to one LexLean model (render.mjs), whose
 * theorems Lean proves and whose acceptance vectors the guest replays.
 *
 * A decision app reads one request, a line of space-separated fields, and
 * answers one outcome word, or `invalid` when the request is malformed.
 * Rules are tried in order; the first that matches decides. Properties are
 * what must never or always happen, and each becomes a theorem.
 *
 * This module is pure: it parses answers, validates a spec and evaluates it.
 * The evaluator is the oracle the vectors and the counterexample search use,
 * and it mirrors the model's semantics exactly (see render.mjs).
 */

export const SPEC_SCHEMA = 'prism/spec/1';
export const INVALID = 'invalid';
/** A number is at most 18 decimal digits, so every value fits the guest's 64-bit arithmetic with room to spare. */
export const MAX_DIGITS = 18;
export const NAT_MAX = 10n ** 18n - 1n;

const WORD = /^[a-z][a-z0-9-]{0,31}$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const OPS = ['<', '<=', '>', '>=', '=', '!='];
const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'be', 'if', 'of', 'to', 'for', 'which', 'whether', 'what', 'decide', 'decides', 'deciding', 'check', 'checks', 'tell', 'tells', 'and', 'or', 'it', 'this', 'that', 'app', 'should', 'will', 'can', 'my', 'me', 'we']);

export class SpecError extends Error {
  constructor(message, where) {
    super(message);
    this.where = where;
  }
}

const refuse = (message, where) => {
  throw new SpecError(message, where);
};

const words = (text) => String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** A kebab name from a purpose sentence: `Payment approval: ...` gives `payment-approval`. */
export function nameFromPurpose(purpose) {
  const text = String(purpose ?? '').trim();
  const head = text.includes(':') ? text.slice(0, text.indexOf(':')) : '';
  const source = head && words(head).length <= 4 ? words(head) : words(text).filter((w) => !STOP.has(w) && !/^\d/.test(w));
  const name = source.slice(0, 3).join('-');
  return NAME.test(name) ? name : 'decision';
}

export const titleFromName = (name) => name.split('-').map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

function sentence(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.includes(':') && t.indexOf(':') < 40 ? t.slice(t.indexOf(':') + 1).trim() : t;
}

/** `role: clerk|manager, amount: number 1..1000000, limit: number` */
export function parseFields(text) {
  const items = String(text).split(/[\n;]|,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) refuse('Name at least one field, such as `amount: number`.', 'fields');
  return items.map((item) => {
    const m = /^([a-z][a-z0-9-]*)\s*(?::|=|\s)\s*(.+)$/i.exec(item);
    if (!m) refuse(`Write each field as \`name: number\` or \`name: a|b|c\`; got \`${item}\`.`, 'fields');
    const name = m[1].toLowerCase();
    const kind = m[2].trim().toLowerCase();
    const number = /^(?:number|integer|whole number|count|nat|amount)\b(.*)$/.exec(kind);
    if (number) {
      const field = { name, kind: 'number' };
      const bounds = number[1].trim();
      let r;
      if ((r = /^(\d+)\s*(?:\.\.|to|-)\s*(\d+)$/.exec(bounds))) Object.assign(field, { min: Number(r[1]), max: Number(r[2]) });
      else if ((r = /^(?:>=|at least|from|min)\s*(\d+)$/.exec(bounds))) field.min = Number(r[1]);
      else if ((r = /^(?:<=|at most|up to|max)\s*(\d+)$/.exec(bounds))) field.max = Number(r[1]);
      else if (bounds) refuse(`I read \`${bounds}\` after number; write bounds as \`number 1..100\`, \`number at least 1\` or \`number at most 100\`.`, 'fields');
      return field;
    }
    const values = kind.replace(/^(?:one of|either)\s+/, '').replace(/[()]/g, '').split(/\s*(?:\||\/|,|\bor\b)\s*/).map((v) => v.trim()).filter(Boolean);
    if (values.length < 2) refuse(`Field \`${name}\` needs \`number\` or at least two choices, such as \`${name}: yes|no\`.`, 'fields');
    return { name, kind: 'choice', values };
  });
}

/** `approved, refused` */
export function parseOutcomes(text) {
  const out = String(text).toLowerCase().split(/\s*(?:\||\/|,|\bor\b|\n)\s*|\s+/).map((v) => v.trim()).filter(Boolean);
  if (out.length < 2) refuse('Name at least two answers, such as `approved, refused`.', 'outcomes');
  return out;
}

const WORD_OPS = [
  [/\bis not at least\b|\bis less than\b|\bless than\b|\bis below\b|\bbelow\b|\bunder\b|\bfewer than\b/, '<'],
  [/\bis at most\b|\bat most\b|\bno more than\b|\bup to\b|\bis within\b|\bwithin\b/, '<='],
  [/\bis more than\b|\bmore than\b|\bis greater than\b|\bgreater than\b|\bis above\b|\babove\b|\bover\b|\bexceeds\b/, '>'],
  [/\bis at least\b|\bat least\b|\bno less than\b/, '>='],
  [/\bis not equal to\b|\bdoes not equal\b|\bdiffers from\b/, '!='],
  [/\bis equal to\b|\bequals\b/, '='],
];

/** One condition against the declared fields. */
export function parseCondition(text, fields) {
  let t = String(text).trim().toLowerCase().replace(/^(?:the|its)\s+/, '');
  for (const [pattern, op] of WORD_OPS) t = t.replace(pattern, ` ${op} `);
  const m = /^([a-z][a-z0-9-]*)\s*(<=|>=|!=|==|=|<|>|\bis not\b|\bisn't\b|\bis\b)\s*(.+)$/.exec(t.replace(/\s+/g, ' ').trim());
  if (!m) refuse(`I could not read the condition \`${text}\`; write it like \`role is manager\` or \`amount <= limit\`.`, 'condition');
  const field = fields.find((f) => f.name === m[1]);
  if (!field) refuse(`\`${m[1]}\` is not a field; the fields are ${fields.map((f) => f.name).join(', ')}.`, 'condition');
  let op = m[2].replace(/\s+/g, ' ');
  const rhs = m[3].trim().replace(/^(?:the|its)\s+/, '');
  if (field.kind === 'choice') {
    if (!['is', 'is not', "isn't", '=', '==', '!='].includes(op)) refuse(`\`${field.name}\` is a choice; compare it with \`is\` or \`is not\`.`, 'condition');
    op = ['is not', "isn't", '!='].includes(op) ? 'is not' : 'is';
    if (!field.values.includes(rhs)) refuse(`\`${rhs}\` is not a choice of \`${field.name}\`; the choices are ${field.values.join(', ')}.`, 'condition');
    return { field: field.name, op, value: rhs };
  }
  op = op === '==' || op === 'is' ? '=' : op === 'is not' || op === "isn't" ? '!=' : op;
  if (!OPS.includes(op)) refuse(`I could not read the comparison in \`${text}\`.`, 'condition');
  if (/^\d+$/.test(rhs)) return { field: field.name, op, value: Number(rhs) };
  const other = fields.find((f) => f.name === rhs);
  if (!other || other.kind !== 'number') refuse(`\`${rhs}\` is neither a whole number nor a number field.`, 'condition');
  return { field: field.name, op, value: { field: other.name } };
}

const conditions = (text, fields) =>
  String(text).split(/\s+and\s+|\s*&&\s*/).map((c) => c.trim()).filter(Boolean).map((c) => parseCondition(c, fields));

function outcomeWord(text, outcomes, where) {
  const w = String(text).trim().toLowerCase().replace(/^(?:the answer is|answer|it is|is)\s+/, '').replace(/[.!]$/, '');
  if (!outcomes.includes(w)) refuse(`\`${w}\` is not an answer; the answers are ${outcomes.join(', ')}.`, where);
  return w;
}

/** `when role is manager then approved` lines, and `otherwise refused`. */
export function parseRules(text, fields, outcomes) {
  const rules = [];
  let otherwise = null;
  for (const raw of String(text).split(/\n|;/).map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean)) {
    const line = raw.replace(/[.]$/, '');
    let m;
    if ((m = /^(?:otherwise|else|default|by default)[,:]?\s+(.+)$/i.exec(line))) {
      otherwise = outcomeWord(m[1], outcomes, 'rules');
    } else if ((m = /^(?:when|if)\s+(.+?)\s*(?:,\s*)?(?:then|->|=>|:)\s*(.+)$/i.exec(line))) {
      rules.push({ when: conditions(m[1], fields), then: outcomeWord(m[2], outcomes, 'rules'), says: raw });
    } else if ((m = /^([a-z][a-z0-9-]*)\s+(?:when|if)\s+(.+)$/i.exec(line))) {
      rules.push({ when: conditions(m[2], fields), then: outcomeWord(m[1], outcomes, 'rules'), says: raw });
    } else refuse(`Write each rule as \`when <condition> then <answer>\`, and end with \`otherwise <answer>\`; got \`${raw}\`.`, 'rules');
  }
  if (rules.length === 0) refuse('Give at least one rule, such as `when role is manager then approved`.', 'rules');
  if (!otherwise) refuse(`Say what happens when no rule matches, such as \`otherwise ${outcomes[outcomes.length - 1]}\`.`, 'rules');
  return { rules: rules.map((r, i) => ({ id: `REQ-${String(i + 1).padStart(3, '0')}`, ...r })), otherwise };
}

/** `never when role is clerk and amount > limit then approved`, or `always ... then ...`. */
export function parseProperties(text, fields, outcomes) {
  const props = [];
  for (const raw of String(text).split(/\n|;/).map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean)) {
    const line = raw.replace(/[.]$/, '').replace(/^it should never be possible that\s+/i, 'never ');
    let m;
    if ((m = /^(never|always)[:,]?\s+(?:when|if)\s+(.+?)\s*(?:,\s*)?(?:then|->|=>)\s*(.+)$/i.exec(line))) {
      props.push({ kind: m[1].toLowerCase(), when: conditions(m[2], fields), then: outcomeWord(m[3], outcomes, 'properties'), says: raw });
    } else if ((m = /^(never|always)[:,]?\s+([a-z][a-z0-9-]*)\s+(?:when|if)\s+(.+)$/i.exec(line))) {
      props.push({ kind: m[1].toLowerCase(), when: conditions(m[3], fields), then: outcomeWord(m[2], outcomes, 'properties'), says: raw });
    } else refuse(`Write each property as \`never when <condition> then <answer>\` or \`always when <condition> then <answer>\`; got \`${raw}\`.`, 'properties');
  }
  return props.map((p, i) => ({ id: `INV-${String(i + 1).padStart(3, '0')}`, ...p }));
}

/** `clerk 250 1000 -> approved` lines. */
export function parseExamples(text) {
  const out = [];
  for (const raw of String(text).split(/\n/).map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean)) {
    const m = /^`?(.*?)`?\s*(?:->|=>|→|gives|answers)\s*`?([a-z][a-z0-9-]*)`?\.?$/i.exec(raw);
    if (!m) refuse(`Write each example as \`<request> -> <answer>\`, such as \`clerk 250 1000 -> approved\`; got \`${raw}\`.`, 'examples');
    out.push({ request: m[1].trim().replace(/^"|"$/g, ''), response: m[2].toLowerCase() });
  }
  return out;
}

/**
 * Prose a person reads but no proof depends on: a reason, a meaning or a
 * limit. One line, at most 240 characters; empty when there is nothing.
 */
const prose = (text) => String(text ?? '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
const withWhy = (item, why) => (prose(why) ? { ...item, why: prose(why) } : item);

/** Validate a whole spec; return it normalized. Throws `SpecError` naming the first problem. */
export function validateSpec(input) {
  const spec = structuredClone(input ?? {});
  if (spec.schema !== undefined && spec.schema !== SPEC_SCHEMA) refuse(`schema must be ${SPEC_SCHEMA}`, 'schema');
  spec.schema = SPEC_SCHEMA;
  if (!spec.name) spec.name = nameFromPurpose(spec.purpose);
  if (!NAME.test(spec.name)) refuse('name must be lower case letters, digits and hyphens, starting with a letter', 'name');
  spec.title = String(spec.title ?? titleFromName(spec.name)).replace(/["\\\p{Cc}]/gu, '').slice(0, 64) || titleFromName(spec.name);
  spec.purpose = String(spec.purpose ?? '').replace(/["\\\p{Cc}]/gu, '').trim();
  if (!spec.purpose) refuse('Say in one sentence what the app decides.', 'purpose');
  spec.actors = (spec.actors ?? []).map(String);
  if (spec.limits !== undefined && !Array.isArray(spec.limits)) refuse('`limits` is a list of what the app does not decide.', 'limits');
  spec.limits = (spec.limits ?? []).map(prose).filter(Boolean);
  if (spec.limits.length === 0) delete spec.limits;

  const fields = spec.fields ?? [];
  if (!Array.isArray(fields) || fields.length === 0) refuse('Name at least one field.', 'fields');
  if (fields.length > 8) refuse('A request has at most eight fields.', 'fields');
  const seen = new Set();
  for (const f of fields) {
    if (!WORD.test(f.name ?? '')) refuse(`Field name \`${f.name}\` must be a lower-case word.`, 'fields');
    if (seen.has(f.name)) refuse(`Field \`${f.name}\` is named twice.`, 'fields');
    seen.add(f.name);
    if (f.kind === 'choice') {
      if (!Array.isArray(f.values) || f.values.length < 2) refuse(`Field \`${f.name}\` needs at least two choices.`, 'fields');
      if (f.values.length > 32) refuse(`Field \`${f.name}\` has more than 32 choices.`, 'fields');
      if (new Set(f.values).size !== f.values.length) refuse(`Field \`${f.name}\` repeats a choice.`, 'fields');
      for (const v of f.values) if (!WORD.test(v)) refuse(`Choice \`${v}\` must be a lower-case word without spaces.`, 'fields');
    } else if (f.kind === 'number') {
      for (const b of ['min', 'max']) if (f[b] !== undefined && !(Number.isSafeInteger(f[b]) && f[b] >= 0)) refuse(`\`${b}\` of \`${f.name}\` must be a whole number.`, 'fields');
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) refuse(`\`${f.name}\` has min above max.`, 'fields');
    } else refuse(`Field \`${f.name}\` must be a \`number\` or a \`choice\`.`, 'fields');
    if (f.means !== undefined) f.means = prose(f.means) || undefined;
    if (f.means === undefined) delete f.means;
  }

  const outcomes = spec.outcomes ?? [];
  if (!Array.isArray(outcomes) || outcomes.length < 2) refuse('Name at least two answers.', 'outcomes');
  if (new Set(outcomes).size !== outcomes.length) refuse('An answer is named twice.', 'outcomes');
  for (const o of outcomes) {
    if (!WORD.test(o)) refuse(`Answer \`${o}\` must be a lower-case word.`, 'outcomes');
    if (o === INVALID) refuse('`invalid` is reserved for malformed requests; pick another word.', 'outcomes');
  }
  if (spec.meanings !== undefined) {
    if (typeof spec.meanings !== 'object' || Array.isArray(spec.meanings)) refuse('`meanings` maps each answer to what it means.', 'outcomes');
    for (const key of Object.keys(spec.meanings)) if (!outcomes.includes(key)) refuse(`\`meanings\` names \`${key}\`, which is not an answer.`, 'outcomes');
    spec.meanings = Object.fromEntries(outcomes.filter((o) => prose(spec.meanings[o])).map((o) => [o, prose(spec.meanings[o])]));
    if (Object.keys(spec.meanings).length === 0) delete spec.meanings;
  }

  const checkConds = (conds, where) => {
    if (!Array.isArray(conds) || conds.length === 0) refuse(`Each ${where} needs at least one condition.`, where);
    for (const c of conds) {
      const f = fields.find((x) => x.name === c.field);
      if (!f) refuse(`\`${c.field}\` is not a field.`, where);
      if (f.kind === 'choice') {
        if (!['is', 'is not'].includes(c.op) || !f.values.includes(c.value)) refuse(`\`${c.field} ${c.op} ${c.value}\` does not name a choice of ${c.field}.`, where);
      } else {
        if (!OPS.includes(c.op)) refuse(`\`${c.op}\` is not a comparison.`, where);
        if (typeof c.value === 'number') {
          if (!(Number.isSafeInteger(c.value) && c.value >= 0)) refuse('Compare numbers with whole numbers.', where);
        } else if (!(c.value && fields.some((x) => x.name === c.value.field && x.kind === 'number'))) refuse(`\`${JSON.stringify(c.value)}\` is not a number field.`, where);
      }
    }
  };
  if (!Array.isArray(spec.rules) || spec.rules.length === 0) refuse('Give at least one rule.', 'rules');
  if (spec.rules.length > 24) refuse('Keep to at most 24 rules.', 'rules');
  spec.rules = spec.rules.map((r, i) => {
    checkConds(r.when, 'rule');
    if (!outcomes.includes(r.then)) refuse(`Rule ${i + 1} answers \`${r.then}\`, which is not an answer.`, 'rules');
    return withWhy({ id: r.id ?? `REQ-${String(i + 1).padStart(3, '0')}`, when: r.when, then: r.then, says: r.says ?? describeRule(r) }, r.why);
  });
  if (!outcomes.includes(spec.otherwise)) refuse('Say which answer applies when no rule matches.', 'rules');
  if (spec.otherwiseWhy !== undefined) spec.otherwiseWhy = prose(spec.otherwiseWhy) || undefined;
  if (spec.otherwiseWhy === undefined) delete spec.otherwiseWhy;
  spec.properties = (spec.properties ?? []).map((p, i) => {
    if (!['never', 'always'].includes(p.kind)) refuse('A property is `never` or `always`.', 'properties');
    checkConds(p.when, 'property');
    if (!outcomes.includes(p.then)) refuse(`Property ${i + 1} names \`${p.then}\`, which is not an answer.`, 'properties');
    return withWhy({ id: p.id ?? `INV-${String(i + 1).padStart(3, '0')}`, kind: p.kind, when: p.when, then: p.then, says: p.says ?? describeProperty(p) }, p.why);
  });
  spec.examples = (spec.examples ?? []).map((e) => ({ request: String(e.request), response: String(e.response) }));
  for (const e of spec.examples) if (e.response !== INVALID && !outcomes.includes(e.response)) refuse(`Example \`${e.request}\` answers \`${e.response}\`, which is not an answer.`, 'examples');
  return spec;
}

const OP_WORDS = { '<': 'is below', '<=': 'is at most', '>': 'is above', '>=': 'is at least', '=': 'equals', '!=': 'differs from', is: 'is', 'is not': 'is not' };
export const describeCondition = (c) => `${c.field} ${OP_WORDS[c.op]} ${typeof c.value === 'object' ? c.value.field : c.value}`;
export const describeConditions = (conds) => conds.map(describeCondition).join(' and ');
export const describeRule = (r) => `When ${describeConditions(r.when)}, the answer is ${r.then}.`;
export const describeProperty = (p) => `It ${p.kind === 'never' ? 'never' : 'always'} answers ${p.then} when ${describeConditions(p.when)}.`;

// ---------------------------------------------------------------------------
// Evaluation: the same semantics the rendered model has.
// ---------------------------------------------------------------------------

/** The model's digit reader: ASCII digits only, no sign, no leading zero, at most 18 of them. */
export function parseNumber(text) {
  if (!/^(0|[1-9][0-9]*)$/.test(text) || text.length > MAX_DIGITS) return null;
  return BigInt(text);
}

/** The decoded request, field name to value (a choice word or a BigInt), or null when malformed. */
export function decodeRequest(spec, text) {
  const parts = text.split(' ');
  if (parts.length !== spec.fields.length) return null;
  const request = {};
  for (const [i, f] of spec.fields.entries()) {
    const part = parts[i];
    if (f.kind === 'choice') {
      if (!f.values.includes(part)) return null;
      request[f.name] = part;
    } else {
      const n = parseNumber(part);
      if (n === null) return null;
      if (f.min !== undefined && n < BigInt(f.min)) return null;
      if (f.max !== undefined && n > BigInt(f.max)) return null;
      request[f.name] = n;
    }
  }
  return request;
}

const operand = (request, value) => (typeof value === 'object' ? request[value.field] : BigInt(value));

export function holds(cond, request) {
  const left = request[cond.field];
  switch (cond.op) {
    case 'is': return left === cond.value;
    case 'is not': return left !== cond.value;
    case '<': return left < operand(request, cond.value);
    case '<=': return left <= operand(request, cond.value);
    case '>': return left > operand(request, cond.value);
    case '>=': return left >= operand(request, cond.value);
    case '=': return left === operand(request, cond.value);
    case '!=': return left !== operand(request, cond.value);
    default: throw new Error(`unknown op ${cond.op}`);
  }
}

/** The outcome of a decoded request and the rule that decided it (null for otherwise). */
export function judge(spec, request) {
  for (const rule of spec.rules) if (rule.when.every((c) => holds(c, request))) return { outcome: rule.then, rule: rule.id };
  return { outcome: spec.otherwise, rule: null };
}

export function requestLimits(spec) {
  const requestMaximum = Math.min(512, Math.max(64, 24 * spec.fields.length + 16));
  return { requestMaximum, responseMaximum: 64, guestAllocationMaximum: requestMaximum * 2 };
}

/** The whole dispatch over bytes: what the guest answers. */
export function respond(spec, bytes) {
  const { requestMaximum } = requestLimits(spec);
  if (bytes.length > requestMaximum) return INVALID;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return INVALID;
  }
  const request = decodeRequest(spec, text);
  return request ? judge(spec, request).outcome : INVALID;
}

export const encodeRequest = (spec, request) => spec.fields.map((f) => String(request[f.name])).join(' ');

/** Candidate values for each field: every choice, and every number that sits on an edge of a comparison or a bound. */
function candidates(spec) {
  const constants = new Set([0n, 1n, 2n]);
  const add = (n) => {
    const v = BigInt(n);
    for (const d of [-1n, 0n, 1n]) if (v + d >= 0n && v + d <= NAT_MAX) constants.add(v + d);
  };
  for (const f of spec.fields) {
    if (f.min !== undefined) add(f.min);
    if (f.max !== undefined) add(f.max);
  }
  for (const c of [...spec.rules.flatMap((r) => r.when), ...spec.properties.flatMap((p) => p.when)]) if (typeof c.value === 'number') add(c.value);
  const sorted = [...constants].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return spec.fields.map((f) => {
    if (f.kind === 'choice') return f.values;
    return sorted.filter((n) => (f.min === undefined || n >= BigInt(f.min)) && (f.max === undefined || n <= BigInt(f.max)));
  });
}

/** Every decoded request over the candidate values, up to `limit`. */
export function* sampleRequests(spec, limit = 200000) {
  const lists = candidates(spec);
  const index = lists.map(() => 0);
  let count = 0;
  if (lists.some((l) => l.length === 0)) return;
  while (count < limit) {
    const request = {};
    spec.fields.forEach((f, i) => (request[f.name] = lists[i][index[i]]));
    yield request;
    count++;
    let i = lists.length - 1;
    while (i >= 0 && ++index[i] === lists[i].length) index[i--] = 0;
    if (i < 0) return;
  }
}

/** A request that breaks the property, or null when none of the sampled requests does. */
export function counterexample(spec, property) {
  let checked = 0;
  for (const request of sampleRequests(spec)) {
    checked++;
    if (!property.when.every((c) => holds(c, request))) continue;
    const { outcome, rule } = judge(spec, request);
    const broken = property.kind === 'never' ? outcome === property.then : outcome !== property.then;
    if (broken) return { request: encodeRequest(spec, request), outcome, rule, checked };
  }
  return { request: null, checked };
}

/** Rules no sampled request reaches, because an earlier rule always wins or the conditions contradict. */
export function unreachableRules(spec) {
  // The sample is an odometer over each field's candidates, last field fastest, cut
  // off at a limit: past it the first fields barely move, so a rule on their later
  // values is never reached though it decides plenty. A rule is called unreachable
  // only when every combination was tried; otherwise nothing is claimed.
  const total = candidates(spec).reduce((n, list) => n * list.length, 1);
  const hit = new Set();
  let tried = 0;
  for (const request of sampleRequests(spec)) {
    tried++;
    const { rule } = judge(spec, request);
    if (rule) hit.add(rule);
  }
  if (tried < total) return [];
  return spec.rules.filter((r) => !hit.has(r.id)).map((r) => r.id);
}
