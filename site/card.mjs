// The Prism's surface. Every place, act, setting and word is PrismSurface's
// (site/surface/surface.mjs, generated with the model), and every decision is
// the verified app's: this script only carries bytes between the page, the
// vault, R4, the routed models and the root guest.
import { openVault, routerDecide } from "./vault/vault.mjs";
import { PLACES, ACTS, LABELS, FLOORS, GROUPS, SETTINGS, WORDS, DOMAINS } from "./surface/surface.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const element = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const store = {
  get: (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* a private window: it holds for this page */ } },
};

// The halt switch is a convenience of this device. It is read on every
// question, so the Boundary sees "halted yes" the moment it is set.
const HALT_KEY = "me.halted";
const PACE_KEY = "me.pace";
const GRANT_KEY = "me.models.grant";
const PLACE_KEY = "me.place";

// Google's consent return, when this window is one. The relay and its sealing
// load only then, so an ordinary visit fetches none of it.
async function relayConsent() {
  if (!/(?:^#|&)state=/.test(location.hash)) return false;
  return (await import("./google/relay.mjs")).relayConsent();
}

// What one kept item says, for its row in a place: a title, who it is from
// or with, and when. It reads the bytes the vault restored and decides
// nothing; an item kept only as a hash says only that.
const lenient = new TextDecoder("utf-8", { fatal: false });

// RFC 5322 and RFC 5545 fold long lines; unfold before reading a field.
const unfold = (text) => text.replace(/\r?\n[ \t]/g, " ");

function headers(text) {
  const head = unfold(text.split(/\r?\n\r?\n/, 1)[0]);
  const out = {};
  for (const line of head.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] ??= line.slice(at + 1).trim();
  }
  return out;
}

// RFC 2047 encoded words, the common case of a subject or a sender's name.
function words(value = "") {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset, kind, data) => {
    try {
      const bytes = kind.toUpperCase() === "B"
        ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        : Uint8Array.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
      return new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch {
      return data;
    }
  });
}

const person = (from = "") => {
  const named = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from);
  return words(named ? named[1] : from.replace(/[<>]/g, ""));
};

function calendarField(text, name) {
  const match = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "mi").exec(unfold(text));
  return match ? match[1].trim().replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ") : "";
}

function icsTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) return NaN;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime();
}

function readItem({ address, outcome, bytes, meta = {}, at = 0 }) {
  const about = meta.about ?? {};
  const base = { address, domain: about.domain ?? 11, media: about.media ?? "plainText", label: meta.label, at: about.at ?? at };
  if (outcome !== "restore") return { ...base, sealed: true, title: "", who: "", text: "", body: "" };
  const text = lenient.decode(bytes);
  if (base.media === "message") {
    const h = headers(text);
    const when = Date.parse(h.date ?? "");
    // A message the owner sent has no From: the other party is its To.
    const body = text.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
    return { ...base, at: Number.isNaN(when) ? base.at : when, title: words(h.subject ?? ""), who: person(h.from || h.to), text, body };
  }
  if (base.media === "calendar") {
    const start = icsTime(calendarField(text, "DTSTART"));
    const title = calendarField(text, "SUMMARY");
    return { ...base, at: Number.isNaN(start) ? base.at : start, title, who: calendarField(text, "LOCATION"), text, body: calendarField(text, "DESCRIPTION") || title };
  }
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return { ...base, title: first.trim(), who: "", text, body: text.trim() };
}

// The kept items an Ask draws on: those sharing the most words with it.
// Sealed items have no words to share, so they are never drawn on.
const QUIET_WORDS = new Set("the and for are but not you your yours with what when where which who whom why how does did have has had was were will would can could should may might this that these those there their them they from into onto about over under just than then also any all some its it's i'm i've me my mine our ours out off get got need needs want wants".split(" "));
const termsOf = (text) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !QUIET_WORDS.has(w)) ?? [];
const RANK = ["public", "internal", "confidential", "restricted"];
const higher = (a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a);

export function drawOn(items, prompt, most = 5) {
  const asked = new Set(termsOf(prompt));
  if (!asked.size) return [];
  const scored = [];
  for (const item of items) {
    if (item.sealed) continue;
    const have = new Set(termsOf(`${item.title} ${item.who} ${item.body ?? item.text}`));
    let score = 0;
    for (const term of asked) if ([...have].some((w) => w === term || (term.length > 3 && (w.startsWith(term) || term.startsWith(w)) && w.length > 3))) score += 1;
    if (score) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || b.item.at - a.item.at).slice(0, most).map((s) => s.item);
}

const short = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const when = (at) => {
  if (!at) return "";
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString() ? clock.format(date) : short.format(date);
};

export default async function start({ app, reason, $ }) {
  // This window may be Google's return with the owner's consent: hand it back and close.
  if (await relayConsent()) return;
  const root = document.documentElement;
  const out = $("pr-out");
  const log = $("pr-log");
  let haltedNow = store.get(HALT_KEY, "no") === "yes";
  const halted = () => (haltedNow ? "yes" : "no");
  let paceNow = store.get(PACE_KEY, "open") === "quiet" ? "quiet" : "open";
  const pace = () => paceNow;

  function say(text, state = "") {
    out.textContent = text;
    out.className = state;
  }
  function remember(what, answer) {
    const row = element("li", {}, element("span", { textContent: what.length > 28 ? `${what.slice(0, 26)}…` : what }), element("span", { className: "tag", textContent: answer }));
    log.prepend(row);
    while (log.children.length > 30) log.lastChild.remove();
  }
  const paintHalt = () => {
    root.classList.toggle("pr-halted", haltedNow);
    if (haltedNow) say(WORDS.halted, "bad");
    else if (out.textContent === WORDS.halted) say("", "idle");
  };
  paintHalt();

  if (!app) {
    say(`${WORDS["not.verified"]}${reason ? ` · ${reason}` : ""}`, "bad");
    for (const control of document.querySelectorAll(".pr button, .pr input, .pr textarea, .pr-ask textarea, .pr-ask button")) control.disabled = true;
    return;
  }

  // The root guest: "<facet> <rest>" in, the facet's answer out.
  const line = async (text) => decoder.decode(await app.dispatch(encoder.encode(text))).trim();

  // The vault: kept in this browser, every keep and read decided by the app.
  let vault = null;
  try {
    vault = await openVault({ decide: routerDecide(line), halted });
  } catch (error) {
    say(`${WORDS.unavailable} · ${error?.message ?? error}`, "bad");
  }

  // Everything kept, read once through the vault (each read is the root's
  // restore decision) and placed by its domain, newest first.
  let items = [];
  async function load() {
    if (!vault) return;
    const rows = await vault.list();
    const read = [];
    for (const row of rows) {
      const got = await vault.get(row.address);
      if (got.outcome === "restore" || got.outcome === "hashonly") read.push(readItem({ address: row.address, outcome: got.outcome, bytes: got.bytes, meta: got.meta, at: row.at }));
    }
    items = read.sort((a, b) => b.at - a.at);
  }

  // Resonance: every gesture of the owner toward a thing is answered by
  // PrismResonance and teaches PrismLearning, through the root guest. What it
  // learned is a sealed snapshot in this browser (addresses and weights only).
  const RESONANCE_KEY = "me.resonance";
  let resonance = null;
  let resonating = null;
  const resonanceOf = () => (resonating ??= import("./resonance/resonance.mjs")
    .then(({ makeResonance }) => makeResonance({ line, halted, attention: pace, keep: { get: () => store.get(RESONANCE_KEY, null), set: (text) => store.set(RESONANCE_KEY, text) } }))
    .then((made) => (resonance = made))
    .catch(() => null));
  const answerOn = (node, event) => {
    if (!node || !event) return;
    for (const name of [...node.classList]) if (name.startsWith("pr-res-")) node.classList.remove(name);
    node.classList.add(`pr-res-${event.answer}`);
  };
  async function gesture(item, kind, options, node) {
    const r = resonance ?? (await resonanceOf());
    if (!r || !item?.address) return null;
    const event = await r.gesture(item, kind, options);
    answerOn(node, event);
    return event;
  }
  // Each open row is one gesture when it closes, with how long the owner stayed.
  const opened = new Map();
  async function closeOpened(node) {
    const open = opened.get(node);
    if (!open) return;
    opened.delete(node);
    await gesture(open.item, "open", { dwellMs: Date.now() - open.since }, node);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") for (const node of [...opened.keys()]) closeOpened(node); });

  // The destinations router: PrismDest and the Boundary decide every hand-off.
  let router = null;
  const routerOf = async () => {
    if (router) return router;
    const { makeRouter } = await import("./dest/dest.mjs");
    router = makeRouter({ line, halted, pace });
    return router;
  };

  // --- Sources: the browser as a host for the owner's content ---
  // PrismHost answers, surface by surface, how this browser may be used; the
  // device code loads only when a surface is used, so an ordinary visit
  // fetches none of it.
  let deviceOpen = null;
  const deviceOf = () => (deviceOpen ??= (async () => {
    const [{ openDevice }, { ingestInto }, host] = await Promise.all([import("./device/device.mjs"), import("./google/ingest.mjs"), import("./device/host.mjs")]);
    const source = openDevice({ decide: (rest) => line(`folder ${rest}`), ingest: ingestInto({ vault }), halted, lanes: host.lanes() });
    return { source, ask: (more = {}) => host.plan({ decide: (rest) => line(`host ${rest}`), halted, ...more }) };
  })());
  async function reportDevice(t) {
    const got = t.store + t.storehash;
    say(`${got} ${WORDS.items}`, got ? "good" : "");
    remember(SETTINGS.find((s) => s.key === "device").name, `${got}`);
    await load();
    if (current.show !== "settings") paintList();
    paintSettings();
  }
  // A paste or a drop anywhere on the page is the owner's own act.
  document.addEventListener("paste", (event) => {
    if (!vault || event.target?.closest?.("input, textarea, [contenteditable]")) return;
    const files = [...(event.clipboardData?.files ?? [])];
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!files.length && !text.trim()) return;
    event.preventDefault();
    (async () => {
      const d = await deviceOf();
      if ((await d.ask({ act: { paste: "owner" } })).paste !== "use") return;
      await reportDevice(files.length ? await d.source.readFiles(files) : await d.source.readText(text));
    })().catch((error) => say(error?.code ?? error?.message ?? String(error), "bad"));
  });
  document.addEventListener("dragover", (event) => { if (event.dataTransfer?.types?.includes("Files")) event.preventDefault(); });
  document.addEventListener("drop", (event) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!vault || !files.length) return;
    event.preventDefault();
    (async () => {
      const d = await deviceOf();
      if ((await d.ask({ act: { drop: "owner" } })).drop !== "use") return;
      await reportDevice(await d.source.readFiles(files));
    })().catch((error) => say(error?.code ?? error?.message ?? String(error), "bad"));
  });
  // The owner's Prism extension, if installed, answers a hello on this page.
  let extensionHere = false;
  window.addEventListener("message", (event) => {
    if (event.source === window && event.origin === location.origin && event.data?.from === "extension" && event.data.prism === "extension") extensionHere = true;
  });
  window.postMessage({ prism: "hello", from: "page" }, location.origin);
  const extensionGrant = () => (extensionHere ? "kept" : "none");
  // Live mail and calendar, read by the installed extension with the owner's own sign-in.
  async function pullExtension(d) {
    const { pull } = await import("./device/extension.mjs");
    return d.source.readItems(await pull(window, { halted: halted() }));
  }
  // On every visit: a folder the owner granted is re-read while the browser
  // keeps the grant, and the installed extension is pulled.
  async function readOnVisit() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const folder = vault && typeof indexedDB?.databases === "function" && (await indexedDB.databases()).some((db) => db.name === "prism-device");
    if (!vault || (!folder && !extensionHere)) return;
    const d = await deviceOf();
    const kept = folder && (await d.source.folders()).some((f) => f.grant === "granted");
    const plan = await d.ask({ grant: { folder: kept ? "kept" : "none", extension: extensionGrant() } });
    if (plan.folder === "use") {
      const t = await d.source.readFolders();
      if (t.store + t.storehash) await reportDevice(t);
    }
    if (plan.extension === "use") {
      const t = await pullExtension(d);
      if (t.store + t.storehash) await reportDevice(t);
    }
  }

  // --- Places ---
  const byKey = new Map(PLACES.map((p) => [p.key, p]));
  const actOf = (place) => ACTS.find((a) => a.key === place.act);
  let current = byKey.get(store.get(PLACE_KEY, "")) ?? PLACES.find((p) => p.host === "home");
  let query = "";

  // A row opens to the item's full words, and closes again.
  function rowOf(item) {
    const what = item.sealed ? WORDS.sealed : item.title || "—";
    const row = element("li", { className: `pr-item${item.sealed ? " pr-sealed" : ""}` },
      element("span", { className: "pr-when", textContent: when(item.at) }),
      element("span", { className: "pr-what", textContent: what }),
      element("span", { className: "pr-who", textContent: item.who || DOMAINS[item.domain] || "" }));
    if (item.sealed || !item.body) return row;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", "false");
    const toggle = () => {
      const open = row.getAttribute("aria-expanded") === "true";
      row.setAttribute("aria-expanded", String(!open));
      if (open) { row.querySelector(".pr-preview")?.remove(); closeOpened(row); }
      else { row.append(element("pre", { className: "pr-preview", textContent: item.body })); opened.set(row, { item, since: Date.now() }); }
    };
    row.addEventListener("click", (event) => { if (!event.target.closest(".pr-preview")) toggle(); });
    row.addEventListener("keydown", (event) => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggle(); }
    });
    return row;
  }

  function paintList() {
    const list = $("pr-list");
    let shown = items.filter((item) => current.domains.includes(item.domain));
    if (current.show === "search") {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      shown = words.length ? items.filter((item) => words.every((w) => `${item.title} ${item.who} ${item.text}`.toLowerCase().includes(w))) : [];
    }
    if (resonance && current.show !== "search") shown = resonance.order(shown);
    $("pr-count").textContent = shown.length ? String(shown.length) : "";
    if (current.show === "search" && !query) { list.replaceChildren(); return; }
    list.replaceChildren(...(shown.length ? shown.slice(0, 200).map(rowOf) : [element("li", { className: "pr-empty", textContent: WORDS.empty })]));
  }

  // One act per place, as PrismSurface names it. Outbound acts are prepared,
  // shown word for word, and leave only on the owner's Send.
  function actForm(place) {
    const act = actOf(place);
    const host = $("pr-act");
    if (place.show === "search") {
      const field = element("input", { type: "search", placeholder: WORDS.search, value: query, autocomplete: "off" });
      field.setAttribute("aria-label", WORDS.search);
      field.addEventListener("input", () => { query = field.value; paintList(); });
      host.replaceChildren(element("div", { className: "pr-row" }, field));
      return;
    }
    if (!act || act.key === "none") { host.replaceChildren(); return; }
    if (act.key === "note") return host.replaceChildren(noteForm(place));
    host.replaceChildren(outboundForm(place, act));
  }

  function noteForm(place) {
    const field = element("input", { type: "text", placeholder: WORDS["note.placeholder"], autocomplete: "off" });
    field.setAttribute("aria-label", WORDS["note.placeholder"]);
    const keep = element("button", { type: "submit", textContent: WORDS.keep });
    const form = element("form", { className: "pr-row pr-note" }, field, keep);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text || !vault) return;
      // The note's label is its domain's floor in the design model, never chosen here.
      const domain = place.domains[0];
      const label = LABELS[FLOORS[domain]].toLowerCase();
      keep.disabled = true;
      try {
        const result = await vault.put(encoder.encode(text), { label, about: { domain, media: "plainText", at: Date.now() } });
        const kept = result.outcome === "store" ? WORDS.kept : result.outcome === "storehash" ? WORDS["kept.sealed"] : WORDS.refused;
        say(kept, result.outcome?.startsWith("store") ? "good" : "bad");
        remember(`${place.name} · ${WORDS["note.placeholder"]}`, result.outcome);
        if (result.outcome?.startsWith("store")) {
          field.value = "";
          await load();
          await gesture(items.find((item) => item.address === result.address), "keep");
          paintList();
        }
      } finally {
        keep.disabled = false;
      }
    });
    return form;
  }

  function outboundForm(place, act) {
    const fields = [];
    const input = (props, label) => {
      const node = element(props.rows ? "textarea" : "input", { autocomplete: "off", ...props });
      node.setAttribute("aria-label", label);
      node.placeholder = props.type === "datetime-local" ? "" : label;
      fields.push(node);
      return node;
    };
    let to = null, body, at = null;
    if (act.target === "mail") { to = input({ type: "email" }, WORDS["write.to"]); body = input({ rows: 3 }, WORDS["write.body"]); }
    if (act.target === "calendar") { at = input({ type: "datetime-local" }, WORDS["event.when"]); body = input({ type: "text" }, WORDS["event.what"]); }
    if (act.target === "platform") body = input({ rows: 3 }, WORDS["share.what"]);
    const review = element("button", { type: "submit", textContent: WORDS.review });
    const send = element("button", { type: "button", className: "pr-primary", textContent: WORDS.send, hidden: true });
    const preview = element("pre", { className: "pr-preview", hidden: true });
    const form = element("form", { className: "pr-compose" }, ...fields, element("div", { className: "pr-row" }, review, send), preview);
    form.setAttribute("aria-label", act.word);
    let pending = null;
    const itemOf = () => {
      const text = body.value;
      const subject = text.split("\n")[0].slice(0, 120);
      if (act.target === "mail") return { target: "mail", cause: "owner", text, payload: { to: to.value, subject, body: text } };
      if (act.target === "calendar") {
        const start = at.value ? new Date(at.value) : new Date(Date.now() + 3600_000);
        // The stamp is fixed here, so the event the owner reviewed is the event that leaves.
        return { target: "calendar", cause: "owner", text, payload: { uid: `${crypto.randomUUID()}@me`, start, end: new Date(start.getTime() + 3600_000), summary: subject, description: text, now: Date.now() } };
      }
      return { target: "platform", cause: "owner", text, payload: { title: subject, text } };
    };
    const word = (answer) => ({ deliver: WORDS.delivered, draft: WORDS.drafted, show: WORDS.shown, hold: WORDS.held, refuse: WORDS.refused })[answer] ?? answer;
    for (const field of fields) field.addEventListener("input", () => { pending = null; send.hidden = true; preview.hidden = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!body.value.trim()) return;
      const r = await routerOf();
      const item = itemOf();
      const decided = await r.prepare(item);
      pending = decided.answer === "draft" ? { item, seal: decided.seal } : null;
      preview.textContent = decided.out?.bytes ?? "";
      preview.hidden = !decided.out;
      send.hidden = !pending;
      say(word(decided.answer), decided.answer === "refuse" ? "bad" : "");
      remember(`${place.name} · ${act.word}`, decided.answer);
    });
    send.addEventListener("click", async () => {
      if (!pending) return;
      send.disabled = true;
      try {
        const done = await (await routerOf()).send(pending.item, pending.seal);
        say(word(done.answer), done.delivered ? "good" : "bad");
        remember(`${place.name} · ${WORDS.send}`, done.answer);
        if (done.delivered) {
          pending = null; send.hidden = true; form.reset(); preview.hidden = true;
          await keepSent(place, act, done.out);
        }
      } finally {
        send.disabled = false;
      }
    });
    return form;
  }

  // What left is kept in the place it left from, at that domain's floor, as
  // the exact bytes that went out; the Boundary and the vault decide the keep.
  const SENT_MEDIA = { mail: "message", calendar: "calendar", platform: "plainText" };
  async function keepSent(place, act, out) {
    if (!vault || !out) return;
    const domain = place.domains[0];
    const label = LABELS[FLOORS[domain]].toLowerCase();
    const result = await vault.put(encoder.encode(out.bytes), { label, about: { domain, media: SENT_MEDIA[act.target], at: Date.now() } });
    remember(`${place.name} · ${WORDS.keep}`, result.outcome);
    if (result.outcome?.startsWith("store")) { await load(); paintList(); }
  }

  function go(key, focus = false) {
    const place = byKey.get(key);
    if (!place || place.host === "composer") return;
    current = place;
    store.set(PLACE_KEY, key);
    for (const button of document.querySelectorAll(".pr-go")) {
      if (button.dataset.place === key) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    $("pr-title").textContent = place.name;
    const settings = place.show === "settings";
    $("pr-settings").hidden = !settings;
    $("pr-list").hidden = settings;
    $("pr-count").hidden = settings;
    actForm(place);
    if (settings) { buildSettings(); paintSettings(); }
    else paintList();
    if (focus) $("pr-title").focus({ preventScroll: false });
  }
  $("pr-title").tabIndex = -1;
  for (const button of document.querySelectorAll(".pr-go")) button.addEventListener("click", () => go(button.dataset.place, true));

  // --- The Boundary's settings: every route in and out, and the stop ---
  // Built on the first visit to the Boundary, so an ordinary visit fetches
  // none of the sources' or models' code and locks.
  let paintSettings = () => {};
  let settingsBuilt = false;
  function buildSettings() {
    if (settingsBuilt) return;
    settingsBuilt = true;
    const host = $("pr-settings");
    const groups = new Map();
    for (const group of GROUPS) {
      const rows = element("div", { className: "pr-rows" });
      host.append(element("section", { className: "pr-set" }, element("h3", { textContent: group.name }), rows));
      groups.set(group.key, rows);
    }
    const settingRow = (setting, ...controls) => {
      const state = element("span", { className: "pr-state" });
      const row = element("div", { className: "pr-setting" }, element("span", { className: "pr-name", textContent: setting.name }), state, element("span", { className: "pr-controls" }, ...controls));
      groups.get(setting.group).append(row);
      return { row, state };
    };
    const switchFor = (checked, label, onChange) => {
      const box = element("input", { type: "checkbox", checked, role: "switch" });
      box.setAttribute("aria-label", label);
      box.addEventListener("change", () => onChange(box.checked));
      return box;
    };
    const named = (key) => SETTINGS.find((s) => s.key === key);
    const painters = [];

    // Sources: this device, through every surface the browser reports. Each
    // control shows only where PrismHost offers it, each read is asked of
    // PrismFolder, and each item is kept through the detectors and the vault.
    (async () => {
      const device = named("device");
      const addFolder = element("button", { type: "button", textContent: WORDS["device.folder"] });
      const contacts = element("button", { type: "button", textContent: WORDS["device.contacts"] });
      const getExtension = element("button", { type: "button", textContent: WORDS["device.extension"] });
      const allow = element("button", { type: "button", textContent: WORDS["device.allow"] });
      const read = element("button", { type: "button", textContent: WORDS["read.now"] });
      const forget = element("button", { type: "button", textContent: WORDS.forget });
      const files = element("input", { type: "file", multiple: true, accept: ".mbox,.mbx,.eml,.ics,.ical,.vcf,.vcard" });
      files.setAttribute("aria-label", WORDS["device.files"]);
      const filesLabel = element("label", { className: "pr-file" }, element("span", { textContent: WORDS["device.files"] }), files);
      const row = settingRow(device, addFolder, filesLabel, contacts, getExtension, allow, read, forget);
      if (!vault) { row.state.textContent = WORDS.unavailable; row.row.querySelector(".pr-controls").hidden = true; return; }
      const d = await deviceOf();
      let kept = [];
      const paint = async () => {
        kept = await d.source.folders().catch(() => []);
        const plan = await d.ask({ grant: { folder: kept.some((f) => f.grant === "granted") ? "kept" : "none", extension: extensionGrant() } });
        const shown = (surface) => plan[surface] === "offer" || plan[surface] === "use";
        row.state.textContent = kept.length ? kept.map((f) => f.name).join(", ") : WORDS["device.none"];
        addFolder.hidden = !shown("folder");
        filesLabel.hidden = !shown("files");
        contacts.hidden = !shown("contacts");
        getExtension.hidden = plan.extension !== "offer";
        allow.hidden = !shown("folder") || !kept.some((f) => f.grant === "prompt");
        read.hidden = plan.folder !== "use" && plan.extension !== "use";
        forget.hidden = !kept.length;
      };
      const owner = (surface) => async () => (await d.ask({ act: { [surface]: "owner" } }))[surface] === "use";
      const busy = (button, may, work) => async () => {
        button.disabled = true;
        try { if (await may()) await work(); } catch (error) { if (error?.name !== "AbortError") say(error?.code ?? error?.message ?? String(error), "bad"); } finally { button.disabled = false; await paint(); }
      };
      addFolder.addEventListener("click", busy(addFolder, owner("folder"), async () => { await d.source.addFolder(); await reportDevice(await d.source.readFolders()); }));
      allow.addEventListener("click", busy(allow, owner("folder"), async () => { await d.source.allow(); await reportDevice(await d.source.readFolders()); }));
      read.addEventListener("click", busy(read, async () => true, async () => {
        const plan = await d.ask({ act: { folder: "owner", extension: "owner" }, grant: { extension: extensionGrant() } });
        if (plan.folder === "use") await reportDevice(await d.source.readFolders());
        if (plan.extension === "use" && extensionHere) await reportDevice(await pullExtension(d));
      }));
      // The extension, written by this page for its own address: one download.
      getExtension.addEventListener("click", busy(getExtension, async () => true, async () => {
        const { pack } = await import("./device/extension.mjs");
        const bytes = await pack(new URL("./", location.href).href);
        const link = element("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/zip" })), download: "prism-extension.zip" });
        link.click();
        URL.revokeObjectURL(link.href);
      }));
      forget.addEventListener("click", busy(forget, async () => true, async () => { for (const f of kept) await d.source.forget(f.id); }));
      files.addEventListener("change", busy(files, owner("files"), async () => { await reportDevice(await d.source.readFiles([...(files.files ?? [])])); files.value = ""; }));
      contacts.addEventListener("click", busy(contacts, owner("contacts"), async () => {
        const picked = await navigator.contacts.select(["name", "email", "tel"], { multiple: true });
        await reportDevice(await d.source.readContacts(picked));
      }));
      painters.push(paint);
      await paint();
    })().catch((error) => console.warn(`sources: ${error?.message ?? error}`));

    // Models: R4, and every model the lock pins, each routed in by the owner's press.
    const models = named("models");
    const r4row = settingRow({ ...models, name: WORDS["model.r4"] });
    painters.push(() => { r4row.state.textContent = r4 ? (r4.engine.state === "match" ? WORDS["model.run"] : WORDS.refused) : WORDS["model.fetch"]; });
    (async () => {
      const lock = await fetch(new URL("./models/models.lock.json", import.meta.url), { cache: "no-cache" }).then((r) => r.json());
      for (const m of lock.models) {
        const toggle = element("button", { type: "button" });
        const row = settingRow({ ...models, name: m.title }, toggle);
        const paint = async () => {
          const granted = grants().includes(m.id);
          toggle.textContent = granted ? WORDS.unroute : WORDS.route;
          const routed = routedModels ?? null;
          const outcome = routed ? (await routed.judge(m.id)).outcome : granted ? "fetch" : "ask";
          row.state.textContent = WORDS[`model.${outcome}`] ?? outcome;
        };
        toggle.addEventListener("click", async () => {
          const now = grants();
          store.set(GRANT_KEY, JSON.stringify(now.includes(m.id) ? now.filter((x) => x !== m.id) : [...now, m.id]));
          routedModels = null;
          await paint();
          remember(m.title, grants().includes(m.id) ? WORDS.route : WORDS.unroute);
        });
        painters.push(paint);
        paint();
      }
    })().catch((error) => console.warn(`models: ${error?.message ?? error}`));

    // Attention: Quiet holds what is not urgent.
    settingRow(named("quiet"), switchFor(paceNow === "quiet", named("quiet").name, (on) => {
      paceNow = on ? "quiet" : "open";
      store.set(PACE_KEY, paceNow);
      remember(named("quiet").name, on ? WORDS.on : WORDS.off);
    }));

    // This browser: what is kept here, and an encrypted backup of it.
    const passphrase = element("input", { type: "password", placeholder: WORDS["passphrase.export"], autocomplete: "new-password" });
    passphrase.setAttribute("aria-label", WORDS["passphrase.export"]);
    const exportButton = element("button", { type: "button", textContent: WORDS.export });
    const importFile = element("input", { type: "file", accept: ".pvx,application/octet-stream" });
    importFile.setAttribute("aria-label", WORDS.import);
    const importLabel = element("label", { className: "pr-file" }, element("span", { textContent: WORDS.import }), importFile);
    const backup = settingRow(named("backup"), passphrase, exportButton, importLabel);
    painters.push(async () => {
      if (!vault) { backup.state.textContent = WORDS.unavailable; return; }
      const where = await vault.persist();
      backup.state.textContent = `${items.length} ${WORDS.items}${where?.persisted ? ` · ${WORDS.persisted}` : ""}`;
    });
    exportButton.addEventListener("click", async () => {
      if (!vault) return;
      if (!passphrase.value) { passphrase.focus(); return; }
      const bytes = await vault.exportTo(passphrase.value);
      const link = element("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), download: "prism-export.pvx" });
      link.click();
      URL.revokeObjectURL(link.href);
      passphrase.value = "";
      remember(WORDS.export, `${bytes.length}`);
    });
    importFile.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      if (!file || !vault) return;
      if (!passphrase.value) { importFile.value = ""; passphrase.focus(); return; }
      const result = await vault.importFrom(new Uint8Array(await file.arrayBuffer()), passphrase.value);
      say(result.outcome === "refuse" ? `${WORDS.refused} · ${result.reason ?? ""}` : WORDS.kept, result.outcome === "refuse" ? "bad" : "good");
      remember(WORDS.import, result.outcome ?? "");
      importFile.value = "";
      passphrase.value = "";
      await load();
      paintSettings();
    });

    // Halt: the Boundary denies every move while it is on.
    const halt = switchFor(haltedNow, named("halt").name, (on) => {
      haltedNow = on;
      store.set(HALT_KEY, on ? "yes" : "no");
      paintHalt();
      remember(named("halt").name, halted());
    });
    halt.id = "pr-halt";
    settingRow(named("halt"), halt);

    paintSettings = () => { for (const paint of painters) paint(); };
  }

  // --- Ask: R4 answers in this browser; a routed text model, if the owner routed one ---
  let r4 = null;
  async function openModel() {
    if (r4) return r4;
    const [{ openR4 }, { guestDecider }] = await Promise.all([import("./r4/r4.mjs"), import("./r4/decide.mjs")]);
    const lock = await fetch(new URL("./r4/r4.lock.json", import.meta.url)).then((response) => response.json());
    say(WORDS["ask.loading"], "wait");
    r4 = await openR4({
      lock,
      decide: guestDecider(app.dispatch),
      boundary: (fields) => line(`boundary ${fields}`),
    });
    return r4;
  }
  const grants = () => { try { return JSON.parse(store.get(GRANT_KEY, "[]")).filter((x) => typeof x === "string"); } catch { return []; } };
  let routedModels = null;
  async function openRouted() {
    if (routedModels) return routedModels;
    const { openModels } = await import("./models/models.mjs");
    const lock = await fetch(new URL("./models/models.lock.json", import.meta.url), { cache: "no-cache" }).then((r) => r.json());
    routedModels = await openModels({ lock, decide: async (request) => ({ outcome: await line(`model ${request}`), rule: "guest" }), grant: { models: grants() }, halted });
    return routedModels;
  }
  async function answer(prompt, context, grounds) {
    const r4model = await openModel();
    if (grants().length) {
      const routed = await openRouted();
      const target = routed.route("text-generation");
      if (target) {
        const decision = await routed.prepare(target);
        if (decision.outcome === "run") {
          routed.connect(r4model, { maxTokens: 128 });
          return r4model.askRouted({ target, prompt, context, grounds });
        }
      }
    }
    return r4model.ask({ prompt, context, grounds });
  }
  // The kept items an Ask drew on, under its answer; each opens like a row.
  const drawn = element("ol", { className: "pr-list pr-drawn" });
  drawn.setAttribute("aria-label", WORDS["ask.placeholder"]);
  out.after(drawn);
  $("pr-ask").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("pr-prompt").value.trim();
    if (!prompt) return;
    $("pr-ask-go").disabled = true;
    // While halted nothing kept is drawn on; the model's own decision refuses too.
    const used = haltedNow ? [] : drawOn(items, prompt);
    drawn.replaceChildren(...used.map(rowOf));
    // The answer carries the highest label of what it drew on.
    const label = used.reduce((at, item) => higher(at, item.label ?? "confidential"), "confidential");
    const grounds = used.map((item) => [when(item.at), item.title, item.who, item.body].filter(Boolean).join(" · ").slice(0, 600));
    try {
      const result = await answer(prompt, { label, halted: halted() }, grounds);
      if (result.outcome === "answer") say(result.answer, "good");
      else if (result.outcome === "ask" && result.release) say(WORDS["answer.asks"], "warn");
      else say(`${WORDS["answer.none"]} · ${result.outcome}`, "bad");
      remember(prompt, result.outcome);
      if (result.outcome === "answer") $("pr-prompt").value = "";
    } catch (error) {
      say(`${WORDS["answer.none"]} · ${error?.message ?? error}`, "bad");
    } finally {
      $("pr-ask-go").disabled = false;
      paintSettings();
    }
  });
  $("pr-prompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("pr-ask").requestSubmit(); }
  });

  go(current.key);
  await load();
  go(current.key);
  root.classList.add("pr-ready");
  // Resonance loads on the owner's first touch, never with the page, then orders what they resonate with first.
  const wake = () => resonanceOf().then((made) => { if (made && current.show !== "settings") paintList(); });
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, wake, { once: true, capture: true });
  readOnVisit().catch((error) => console.warn(`sources: ${error?.message ?? error}`));
}
