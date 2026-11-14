// The R4 router: maps the values of incoming content, in its own schema, onto
// the Prism's features. For each value and each feature it asks the root guest
// (PrismRouter, "router <source> <value> <feature> <provider> <halted>") and
// does only what it answers: map runs the feature's compiled reader, direct
// takes the value the schema already types, skip and refuse do nothing.
//
//   const mapped = await route({ source: "note", values: { text }, line, halted });
//   // { start, allDay, intent, parties, kind, topics, domains, decisions }
//
// What the owner's content has taught the readers (the people it is with and
// the words it keeps using) comes in as `learned` (see labels.mjs).
import { FIELDS, PROVIDERS } from "./table.mjs";
import { READERS, domainsFor, kindOf } from "./features.mjs";

const [, VALUE_NAMES] = FIELDS.find(([name]) => name === "value");
const [, FEATURE_NAMES] = FIELDS.find(([name]) => name === "feature");
// Time before intent: what a text asks of the owner depends on whether it names a time.
const ORDER = ["time", ...FEATURE_NAMES.filter((f) => f !== "time")];
const provider = (feature) => (PROVIDERS[feature]?.kind === "compiled" && READERS[feature] ? "compiled" : "absent");

export async function route({ source, values, line, halted, now = Date.now(), learned = {} }) {
  const out = { start: null, allDay: false, intent: null, parties: [], kind: null, topics: [], decisions: [] };
  const cues = { shapes: [], subject: "", text: "", from: [] };
  for (const feature of ORDER) {
    for (const value of VALUE_NAMES) {
      const given = values[value];
      if (given == null || given === "" || (Array.isArray(given) && !given.length)) continue;
      const request = `${source} ${value} ${feature} ${provider(feature)} ${halted()}`;
      const answer = (await line(`router ${request}`)).trim();
      out.decisions.push([request, answer]);
      if (answer === "refuse") return { ...out, refused: true, domains: [] };
      if (answer === "direct") take(out, cues, feature, value, given);
      else if (answer === "map") take(out, cues, feature, value, READERS[feature](given, { now, start: out.start, ...learned }));
    }
  }
  // The kind is decided once, from every cue the router let the kind reader see.
  if (out.decisions.some(([request, answer]) => answer === "map" && request.split(" ")[2] === "kind")) out.kind = kindOf(cues);
  if (!out.parties.some((p) => !p.robot)) out.parties.push(...(out.mentioned ?? []));
  out.party = out.parties[0]?.name ?? null;
  out.domains = domainsFor(out.intent, out.start);
  return out;
}

// Time and intent keep the first value they reach; who it is with and what it
// is about gather from every value; the kind gathers its cues.
function take(out, cues, feature, value, got) {
  if (got == null) return;
  if (feature === "time" && out.start == null) {
    if (typeof got === "number") out.start = got;
    else { out.start = got.start; out.allDay = got.allDay; out.spans = got.spans ?? []; }
  } else if (feature === "intent" && out.intent == null) out.intent = got;
  else if (feature === "party") {
    // The people its schema names are who it is with; the people its words
    // mention are, only when its schema names no one (a note).
    const list = Array.isArray(got) ? got : [{ name: String(got), address: "" }];
    const into = value === "party" ? out.parties : (out.mentioned ??= []);
    for (const one of list) {
      const key = (one.address || one.name || "").toLowerCase();
      if (key && !into.some((p) => (p.address || p.name).toLowerCase() === key)) into.push(one);
    }
    if (value === "party") cues.from.push(...list.filter((p) => p.role === "from"));
  } else if (feature === "kind") {
    if (value === "shape") cues.shapes.push(...got);
    else if (value === "subject") cues.subject += ` ${got}`;
    else if (value === "text") cues.text += ` ${got}`;
  } else if (feature === "topic") {
    for (const t of got) if (!out.topics.includes(t)) out.topics.push(t);
  }
}
