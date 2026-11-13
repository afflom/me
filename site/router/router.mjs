// The R4 router: maps the values of incoming content, in its own schema, onto
// the Prism's features. For each value and each feature it asks the root guest
// (PrismRouter, "router <source> <value> <feature> <provider> <halted>") and
// does only what it answers: map runs the feature's compiled reader, direct
// takes the value the schema already types, skip and refuse do nothing.
//
//   const mapped = await route({ source: "note", values: { text }, line, halted });
//   // { start, allDay, intent, domains, decisions }
import { FIELDS, PROVIDERS } from "./table.mjs";
import { READERS, domainsFor } from "./features.mjs";

const [, VALUE_NAMES] = FIELDS.find(([name]) => name === "value");
const [, FEATURE_NAMES] = FIELDS.find(([name]) => name === "feature");
// Time before intent: what a text asks of the owner depends on whether it names a time.
const ORDER = ["time", ...FEATURE_NAMES.filter((f) => f !== "time")];
const provider = (feature) => (PROVIDERS[feature]?.kind === "compiled" && READERS[feature] ? "compiled" : "absent");

export async function route({ source, values, line, halted, now = Date.now() }) {
  const out = { start: null, allDay: false, intent: null, party: null, decisions: [] };
  for (const feature of ORDER) {
    for (const value of VALUE_NAMES) {
      const given = values[value];
      if (given == null || given === "") continue;
      const request = `${source} ${value} ${feature} ${provider(feature)} ${halted()}`;
      const answer = (await line(`router ${request}`)).trim();
      out.decisions.push([request, answer]);
      if (answer === "refuse") return { ...out, refused: true, domains: [] };
      if (answer === "direct") take(out, feature, given);
      else if (answer === "map") take(out, feature, READERS[feature](given, { now, start: out.start }));
    }
  }
  out.domains = domainsFor(out.intent, out.start);
  return out;
}

// The first value a feature reaches is the one it keeps.
function take(out, feature, got) {
  if (got == null) return;
  if (feature === "time" && out.start == null) {
    if (typeof got === "number") out.start = got;
    else { out.start = got.start; out.allDay = got.allDay; }
  } else if (feature === "intent" && out.intent == null) out.intent = got;
  else if (feature === "party" && out.party == null) out.party = got;
}
