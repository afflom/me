// The Models row of the page's Connections section (MD-01). One line per
// model the lock pins: where it comes from, what the Prism Models decision
// says about it now, and one button, the owner's act: route it into the Prism,
// or stop routing it. Every state shown is the decision's answer, asked
// through the Prism root's "model" facet; nothing here decides.
//
//   const models = await mountModels(root, { line, halted });
//   models.route("text-generation")  -> a granted model id, or null
//   await models.ready(id)            -> fetch and load it, as the decision allows
import { openModels } from "./models.mjs";
import { guestDecider } from "../r4/decide.mjs";

const GRANT_KEY = "me.models.grant";
const element = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const WORDS = {
  ask: "not routed into your Prism",
  fetch: "routed; loads on first use",
  run: "routed and loaded in this browser",
  refuse: "refused",
};

function readGrant() {
  try { return { models: JSON.parse(localStorage.getItem(GRANT_KEY) ?? "[]").filter((x) => typeof x === "string") }; } catch { return { models: [] }; }
}
function writeGrant(grant) {
  try { localStorage.setItem(GRANT_KEY, JSON.stringify(grant.models)); } catch { /* private window: holds for this page */ }
}

export async function mountModels(root, { line, halted = () => "no", base = new URL("./", import.meta.url) } = {}) {
  if (typeof line !== "function") throw new Error("mountModels needs line (the Prism root guest)");
  const lock = await (await fetch(new URL("models.lock.json", base), { cache: "no-cache" })).json();
  const decide = guestDecider((bytes) => line(new TextDecoder().decode(bytes)).then((t) => new TextEncoder().encode(t)), { facet: "model" });
  const grant = readGrant();
  let status = null;
  let models = await openModels({ lock, decide, grant, halted, onProgress: (p) => p.fetching && say(`Fetching ${p.fetching}…`) });
  const say = (text) => { if (status) status.textContent = text; };

  root.replaceChildren(element("h3", { textContent: "Models" }));
  const rows = new Map();
  for (const m of lock.models) {
    const state = element("span", { className: "models-state" });
    const toggle = element("button", { type: "button" });
    const from = element("span", { className: "models-from", textContent: `${m.source.repository} @ ${m.source.revision.slice(0, 7)} · ${m.format.toUpperCase()} · ${m.task}` });
    const block = element("div", { className: "models-row" });
    block.append(element("strong", { textContent: m.title }), from, state, toggle);
    root.append(block);
    rows.set(m.id, { state, toggle });
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      const on = grant.models.includes(m.id);
      grant.models = on ? grant.models.filter((x) => x !== m.id) : [...grant.models, m.id];
      writeGrant(grant);
      await paint();
    });
  }
  status = element("p", { className: "models-status", role: "status" });
  root.append(status);

  async function paint() {
    for (const [id, row] of rows) {
      const { outcome } = await models.judge(id);
      row.state.textContent = WORDS[outcome] ?? outcome;
      row.toggle.textContent = grant.models.includes(id) ? "Stop routing" : "Route into my Prism";
      row.toggle.disabled = false;
    }
  }
  await paint();

  return {
    route: (task) => models.route(task),
    async ready(id) {
      const decision = await models.prepare(id);
      await paint();
      say(decision.outcome === "run" ? "" : `Not loaded: ${WORDS[decision.outcome] ?? decision.outcome}.`);
      return decision;
    },
    connect: (r4, options) => models.connect(r4, options),
    paint,
  };
}
