// The Prism's surface. Every place, act, setting and word is PrismSurface's
// (site/surface/surface.mjs, generated with the model), and every decision is
// the verified app's: this script only carries bytes between the page, the
// vault, R4, the routed models and the root guest.
import { openVault, routerDecide } from "./vault/vault.mjs";
import { PLACES, ACTS, LABELS, FLOORS, SETTINGS, SECTIONS, SETUP, WORDS, DOMAINS, FEEDERS, FONTS } from "./surface/surface.mjs";
// The coherence registry's runtime: what an item is about, what an Ask is
// after, and Today. Loaded once there is something kept or asked, so an
// ordinary first visit fetches none of it.
let coherenceOpen = null;
const coherence = () => (coherenceOpen ??= Promise.all([import("./coherence/sense.mjs"), import("./coherence/today.mjs"), import("./coherence/people.mjs")]).then(([sense, day, people]) => ({ ...sense, ...day, ...people })));

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
  // What the R4 router mapped it onto when it came in: its time, its intent and its places.
  if (Number.isFinite(about.start)) Object.assign(base, { at: about.start, start: about.start, allDay: Boolean(about.allDay) });
  if (about.intent) base.intent = about.intent;
  if (Array.isArray(about.domains) && about.domains.length) base.mapped = about.domains;
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
    const allDay = /^\d{8}$/.test(calendarField(text, "DTSTART"));
    return { ...base, at: Number.isNaN(start) ? base.at : start, allDay, title, who: calendarField(text, "LOCATION"), text, body: calendarField(text, "DESCRIPTION") || title };
  }
  if (base.media === "contactCard") {
    const field = (name) => calendarField(text, name);
    return { ...base, title: field("FN") || field("N").split(";").filter(Boolean).reverse().join(" "), who: field("EMAIL") || field("TEL") || field("ORG"), text, body: [field("EMAIL"), field("TEL"), field("ORG"), field("ADR").replace(/;+/g, " ").trim()].filter(Boolean).join("\n") };
  }
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return { ...base, title: first.trim(), who: "", text, body: text.trim() };
}


const short = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
// Something that happens at a time (an event, or a jot the router gave a time) shows its day and clock.
const dayClock = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayOnly = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const scheduled = (item) => (item.start != null || item.media === "calendar") && item.at;
const whenOfItem = (item) => (scheduled(item) ? (item.allDay ? dayOnly : dayClock).format(new Date(item.at)) : when(item.at));
const when = (at) => {
  if (!at) return "";
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString() ? clock.format(date) : short.format(date);
};

// A browser that kept an earlier deploy runs it until its service worker is
// replaced, and the worker's script is the same bytes on every deploy, so the
// browser never replaces it: a returning owner got today's page around an
// earlier deploy's code, whose buttons have no handlers. Each deploy's
// precache.json names its version, and the worker keeps its files under
// prism-<version>. When the version served differs from every cache this page
// keeps, the kept deploy is dropped and the page loads once more, fresh.
const HEALED_KEY = "me.healed";
export async function heal({ caches: store = globalThis.caches, sw = globalThis.navigator?.serviceWorker, reload = () => location.reload() } = {}) {
  try {
    if (!store || !sw?.controller) return false;
    const manifest = new URL("./precache.json", import.meta.url).href;
    const ours = [];
    for (const name of await store.keys()) {
      if (name.startsWith("prism-") && (await (await store.open(name)).match(manifest))) ours.push(name);
    }
    if (!ours.length) return false;
    const served = await fetch(manifest, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    if (!served?.version || ours.includes(`prism-${served.version}`)) return false;
    // Once per version and tab, so a failure can never loop.
    if (sessionStorage.getItem(HEALED_KEY) === served.version) return false;
    sessionStorage.setItem(HEALED_KEY, served.version);
    for (const registration of await sw.getRegistrations()) {
      if (new URL(registration.scope).href === new URL("./", import.meta.url).href) await registration.unregister();
    }
    for (const name of ours) await store.delete(name);
    reload();
    return true;
  } catch {
    return false;
  }
}

export default async function start({ app, reason, $ }) {
  if (await heal()) return;
  // This window may be Google's return with the owner's consent: hand it back and close.
  if (await relayConsent()) return;
  const root = document.documentElement;
  const out = $("pr-out");
  let haltedNow = store.get(HALT_KEY, "no") === "yes";
  const halted = () => (haltedNow ? "yes" : "no");
  let paceNow = store.get(PACE_KEY, "open") === "quiet" ? "quiet" : "open";
  const pace = () => paceNow;

  function say(text, state = "") {
    out.textContent = text;
    out.className = state;
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
    // Every value is kept as its uorc archive, named by its kappa label; the
    // client and the two facets' adapters load only when a value is first kept or opened.
    let made = null;
    const made$ = () => (made ??= import("./uorc/objects.mjs").then((m) => m.makeObjects({ client: () => m.loadClient(), decide: m.rootDecide(line), halted })));
    const objects = { keep: async (bytes) => (await made$()).keep(bytes), open: async (archive, kappa) => (await made$()).open(archive, kappa) };
    vault = await openVault({ decide: routerDecide(line), halted, objects });
  } catch (error) {
    say(`${WORDS.unavailable} · ${error?.message ?? error}`, "bad");
  }

  // Everything kept, read once through the vault (each read is the root's
  // restore decision) and placed by its domain, newest first.
  let items = [];
  async function load() {
    if (!vault) return;
    const rows = await vault.list();
    const { domainsOf, peopleOf, peoplePlace, between, selfOf, fromMe } = rows.length ? await coherence() : {};
    const read = [];
    for (const row of rows) {
      const got = await vault.get(row.address);
      if (got.outcome !== "restore" && got.outcome !== "hashonly") continue;
      const item = readItem({ address: row.address, outcome: got.outcome, bytes: got.bytes, meta: got.meta, at: row.at });
      // Its domains: its media's, and each one its words name (the coherence registry's vocabulary).
      item.domains = item.mapped ?? domainsOf(item);
      read.push(item);
    }
    items = read.sort((a, b) => b.at - a.at);
    // Ask is offered once there is something of the person's to ask about.
    $("pr-ask").hidden = !items.length;
    // The people in what is kept, for the place that lists them.
    if (selfOf) { inferred = selfOf(items); mineOf = fromMe; }
    people = peopleOf ? { place: peoplePlace, all: peopleOf(items, meNow()), between } : null;
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
    // The observer (PrismHolon and PrismCurate) watches every answer and tunes the engine.
    .then((made) => import("./holon/page.mjs").then(({ observe }) => observe({ line, halted, made, place: () => current.key })).then(() => made, () => made))
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
    const source = openDevice({ decide: (rest) => line(`folder ${rest}`), ingest: ingestInto({ vault }), halted, lanes: host.lanes(), source: (rest) => line(`source ${rest}`), arrived: noteArrived });
    return { source, ask: (more = {}) => host.plan({ decide: (rest) => line(`host ${rest}`), halted, ...more }) };
  })());
  async function reportDevice(t) {
    const got = t.store + t.storehash;
    say(`${got} ${WORDS.items}`, got ? "good" : "");
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
      const t = files.length ? await d.source.readFiles(files) : await d.source.readText(text);
      // Plain words pasted are the owner's note, kept in this place (or Topics).
      if (!files.length && t.skip && !(t.store + t.storehash)) await keepNote(current.act === "note" ? current : byKey.get("library"), text.trim(), current.act === "note" ? current.domains[0] : 11);
      else await reportDevice(t);
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
  // What arrived from each declared service, kept in this browser so the
  // Connections row can say that content is arriving: { key: { n, at } }.
  const ARRIVED = "prism-arrived";
  const arrivedNow = () => { try { return JSON.parse(localStorage.getItem(ARRIVED) ?? "{}") ?? {}; } catch { return {}; } };
  function noteArrived(service, kept, seen = kept) {
    const all = arrivedNow();
    const was = all[service] ?? { n: 0, at: 0 };
    all[service] = { n: was.n + kept, at: seen > 0 ? Date.now() : was.at };
    try { localStorage.setItem(ARRIVED, JSON.stringify(all)); } catch { /* the row then says Connected */ }
  }
  const importedNow = () => Object.fromEntries(Object.entries(arrivedNow()).filter(([, a]) => a.n > 0).map(([key]) => [key, true]));
  // The owner's Prism extension, if installed, answers a hello on this page.
  let extensionHere = false;
  // An extension added while this page is open answers later: what it carries is taken at once.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.from !== "extension" || event.data.prism !== "extension") return;
    const fresh = !extensionHere;
    extensionHere = true;
    if (fresh && arriving) arrive().catch((error) => console.warn(`sources: ${error?.message ?? error}`));
  });
  const hello = () => window.postMessage({ prism: "hello", from: "page" }, location.origin);
  hello();
  addEventListener("focus", hello);
  let arriving = false;
  const extensionGrant = () => (extensionHere ? "kept" : "none");
  // The declared services, carried by the installed extension with the
  // owner's own sign-in; PrismSource decides each item by its service and route.
  async function pullExtension(d) {
    const { pull } = await import("./device/extension.mjs");
    const by = new Map();
    const { SERVICES } = await import("./source/declared.mjs");
    // The declarations go to the extension as data, each own route only where PrismSource reads it.
    const sent = [];
    for (const service of SERVICES) sent.push({ ...service, own: (await line(`source ${service.key} own read ${halted()}`)) === "read" ? service.own ?? [] : [] });
    for (const item of await pull(window, { halted: halted(), services: sent })) {
      if ((await line(`source ${item.service} ${item.route} read ${halted()}`)) !== "read") continue;
      if (!by.has(item.service)) by.set(item.service, []);
      by.get(item.service).push(item);
    }
    const total = { files: 0, store: 0, storehash: 0, ask: 0, refuse: 0, skip: 0 };
    for (const [service, items] of by) {
      const t = await d.source.readItems(items);
      for (const key of Object.keys(total)) total[key] += t[key] ?? 0;
      noteArrived(service, t.store + t.storehash, items.length);
    }
    return total;
  }
  // On every visit, and every few minutes while the page is open: a folder the
  // owner granted is re-read while the browser keeps the grant, and what the
  // installed extension carried is taken. Nothing to press.
  const ARRIVAL_MINUTES = 5;
  async function readOnVisit() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    arriving = true;
    setInterval(() => { if (halted() === "no") arrive().catch((error) => console.warn(`sources: ${error?.message ?? error}`)); }, ARRIVAL_MINUTES * 60000);
    await arrive();
  }
  async function arrive() {
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
  const onPage = (p) => p && p.host !== "none" && p.host !== "composer";
  let current = [byKey.get(store.get(PLACE_KEY, ""))].find(onPage) ?? PLACES.find((p) => p.host === "home");
  let query = "";

  // A row opens to the item's full words, and closes again.
  function rowOf(item) {
    const what = item.sealed ? WORDS.sealed : item.title || "—";
    const row = element("li", { className: `pr-item${item.sealed ? " pr-sealed" : ""}` },
      element("span", { className: "pr-when", textContent: whenOfItem(item) }),
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

  // What the device row's file picker takes: zips (Takeout) and the formats PrismFolder reads.
  const FILE_TYPES = ".zip,.mbox,.mbx,.eml,.ics,.ical,.vcf,.vcard,.txt,.csv";
  const emptyRow = () => element("li", { className: "pr-empty", textContent: WORDS.empty });

  // Today: the agenda ahead (PrismChronology says what falls today and what
  // clashes), then what came in lately, then what is to do.
  const relate = async (a, b, c, d) => line(`when ${a} ${b} ${c} ${d}`);
  let painting = 0;
  async function paintToday(list) {
    const turn = ++painting;
    // The home's cards count every place and offer each one's feeder.
    homeCards();
    paintSetup();
    list.hidden = !items.length;
    if (!items.length) { list.replaceChildren(emptyRow()); return; }
    const { today, lineOf } = await coherence();
    const me = meNow();
    const { agenda, recent, tasks, needs } = await today(items, { relate, done: doneSet(), mine: (item) => mineOf(item, me) });
    if (turn !== painting || current.host !== "home") return;
    const rows = [selfRow()].filter(Boolean);
    const section = (domain, made) => {
      if (!made.length) return;
      rows.push(element("li", { className: "pr-section", textContent: DOMAINS[domain] }), ...made);
    };
    section(5, agenda.map(({ item, today: now, clash }) => {
      const row = rowOf(item);
      row.classList.toggle("pr-now", now);
      if (clash.length) { row.classList.add("pr-clash"); row.title = clash.map(lineOf).join("\n"); }
      return row;
    }));
    if (needs.length) rows.push(needsOf(needs));
    section(4, recent.map(rowOf));
    section(9, tasks.map(rowOf));
    $("pr-count").textContent = "";
    list.hidden = !rows.length;
    list.replaceChildren(...(rows.length ? rows : [emptyRow()]));
  }

  // Needs me: what asks the person something or names a deadline, each with
  // one gesture that clears it. What the person cleared is kept as addresses only.
  const DONE_KEY = "me.done";
  const doneSet = () => { try { return new Set(JSON.parse(store.get(DONE_KEY, "[]"))); } catch { return new Set(); } };
  function clear(item) {
    const done = [...doneSet(), item.address].slice(-500);
    store.set(DONE_KEY, JSON.stringify(done));
    paintList();
  }
  function needsOf(needs) {
    const name = WORDS.needs;
    const list = element("ul", { className: "pr-needs-list" });
    list.setAttribute("aria-label", name);
    for (const { item, phrase } of needs) {
      const button = element("button", { type: "button", className: "pr-done", textContent: WORDS.done });
      button.setAttribute("aria-label", `${WORDS.done}: ${item.title || item.who}`);
      button.addEventListener("click", () => clear(item));
      const why = phrase ? phrase[0].toUpperCase() + phrase.slice(1) : item.who || "";
      list.append(element("li", { className: "pr-item pr-need" },
        button,
        element("span", { className: "pr-what", textContent: item.title || "—" }),
        element("span", { className: "pr-who", textContent: why })));
    }
    return element("li", { className: "pr-needs" }, element("h3", { className: "pr-section", textContent: name }), list);
  }

  // Who you are: what the person declared, else what their mail says, until
  // they confirm it. It is how the Prism tells the person from everyone else;
  // it stays in this browser.
  const IDENTITY_KEY = "me.identity";
  let inferred = { names: [], addresses: [] };
  let mineOf = () => false;
  const declared = () => { try { return JSON.parse(store.get(IDENTITY_KEY, "null")); } catch { return null; } };
  const meNow = () => declared() ?? inferred;
  const listOf = (text) => [...new Set(String(text).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
  const meLine = (me) => [...me.names, ...me.addresses].join(" · ");
  async function declare(me) {
    store.set(IDENTITY_KEY, JSON.stringify({ names: me.names, addresses: me.addresses.map((a) => a.toLowerCase()) }));
    await load();
    paintList();
    paintSettings();
  }
  function selfRow() {
    if (declared() || !inferred.addresses.length) return null;
    const button = element("button", { type: "button", className: "pr-done", textContent: WORDS["identity.confirm"] });
    button.addEventListener("click", () => declare(inferred));
    return element("li", { className: "pr-me" },
      element("h3", { className: "pr-section", textContent: SETTINGS.find((s) => s.key === "identity").name }),
      element("div", { className: "pr-item pr-need" }, button, element("span", { className: "pr-what", textContent: meLine(inferred) })));
  }

  // People: one row per person; pressing one opens their page, with what is
  // open between you first (the next meeting, the latest message).
  let people = null;
  let personOpen = null;
  function paintPeople(list) {
    const one = personOpen && people.all.find((p) => p.key === personOpen);
    if (one) {
      $("pr-count").textContent = "";
      const head = element("li", { className: "pr-person-head" }, element("h3", { className: "pr-person-name", textContent: one.name }));
      return list.replaceChildren(head, ...people.between(one).map(rowOf));
    }
    $("pr-count").textContent = people.all.length ? String(people.all.length) : "";
    list.replaceChildren(...(people.all.length ? people.all.slice(0, 200).map((p) => {
      const latest = people.between(p)[0];
      const row = element("li", { className: "pr-item pr-person" },
        element("span", { className: "pr-when", textContent: latest ? when(latest.at) : "" }),
        element("button", { type: "button", className: "pr-what pr-person-go", textContent: p.name }),
        element("span", { className: "pr-who", textContent: latest?.title ?? "" }));
      row.querySelector("button").addEventListener("click", () => { personOpen = p.key; paintList(); });
      return row;
    }) : [emptyRow()]));
    // Notes kept here stay here, after the people.
    const notes = items.filter((item) => item.media === "plainText" && (item.domains ?? [item.domain]).some((d) => current.domains.includes(d)));
    list.append(...notes.slice(0, 50).map(rowOf));
  }

  function paintList() {
    const list = $("pr-list");
    if (current.host === "home") { paintToday(list).catch((error) => say(error?.message ?? String(error), "bad")); return; }
    if (people && current.key === people.place) { paintPeople(list); return; }
    let shown = items.filter((item) => (item.domains ?? [item.domain]).some((d) => current.domains.includes(d)));
    if (current.show === "search") {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      shown = words.length ? items.filter((item) => words.every((w) => `${item.title} ${item.who} ${item.text}`.toLowerCase().includes(w))) : [];
    }
    if (resonance && current.show !== "search") shown = resonance.order(shown);
    $("pr-count").textContent = shown.length ? String(shown.length) : "";
    if (current.show === "search" && !query) { list.replaceChildren(); return; }
    list.replaceChildren(...(shown.length ? shown.slice(0, 200).map(rowOf) : [emptyRow()]));
  }

  // The home: a card per place, its count and latest item, and the feeder
  // PrismSurface binds to it, so an empty place offers what fills it.
  function homeCards() {
    for (const card of document.querySelectorAll("#pr-home .pr-card")) {
      const place = byKey.get(card.querySelector(".pr-card-go").dataset.place);
      const held = items.filter((item) => (item.domains ?? [item.domain]).some((d) => place.domains.includes(d)));
      card.querySelector(".pr-card-count").textContent = held.length ? String(held.length) : "";
      card.querySelector(".pr-card-latest").textContent = held.length ? (held[0].sealed ? WORDS.sealed : held[0].title || "") : "";
      card.classList.toggle("pr-card-empty", !held.length);
    }
  }
  for (const button of document.querySelectorAll("#pr-home .pr-card-go")) button.addEventListener("click", () => go(button.dataset.place, true));
  for (const button of document.querySelectorAll("#pr-home .pr-card-feed[data-setup]")) {
    button.addEventListener("click", () => setupAt(SETUP.findIndex((step) => step.key === button.dataset.setup)));
  }
  for (const button of document.querySelectorAll("#pr-home .pr-card-feed[data-feed]")) {
    button.addEventListener("click", () => {
      const feeder = FEEDERS.find((f) => f.key === button.dataset.feed);
      if (feeder.act !== "none") {
        go(button.dataset.place);
        $("pr-act").querySelector("input, textarea")?.focus();
        return;
      }
      go(PLACES.find((p) => p.show === "settings").key);
      const name = SETTINGS.find((s) => s.key === feeder.setting).name;
      // The source's row is drawn once its code arrives: wait for it, then bring it to hand.
      const reach = (tries) => {
        const row = [...document.querySelectorAll("#pr-settings .pr-setting")].find((r) => r.querySelector(".pr-name")?.textContent === name);
        const control = row?.querySelector("label.pr-file");
        if (!control) return tries > 0 && setTimeout(reach, 50, tries - 1);
        row.scrollIntoView({ block: "center" });
        // The owner's press on the card is the press on the source's own act: its picker opens.
        control.querySelector("input").click();
      };
      reach(40);
    });
  }


  // Set up: the few sections a person meets first (PrismSurface's setup), in
  // order. Until each is done Today leads with one card naming the steps and
  // the next; Continue opens that step alone in Settings, numbered, with Back,
  // Later and Next. An empty place offers the step that fills it.
  let servicesLive = false;
  const SECTION_DONE = {
    self: () => Boolean(declared()),
    sources: () => servicesLive || items.length > 0,
  };
  const stepDone = (step) => (SECTION_DONE[step.section] ?? (() => false))();
  const setupLeft = () => SETUP.filter((step) => !stepDone(step));
  let setupStep = -1;
  const setupCard = $("pr-setup");
  function paintSetup() {
    const left = setupLeft();
    const shown = current.host === "home" && left.length > 0;
    setupCard.hidden = !shown;
    // While nothing has arrived and set up is not done, Today holds only the card and the note.
    $("pr-home").hidden = current.host !== "home" || (shown && !items.length);
    $("pr-ask").hidden = !items.length;
    if (!shown) return false;
    const next = left[0];
    const steps = element("ol", { className: "pr-steps" }, ...SETUP.map((step) => element("li", {
      className: stepDone(step) ? "pr-step pr-step-done" : step === next ? "pr-step pr-step-next" : "pr-step",
      textContent: WORDS[step.word],
    })));
    const go_ = element("button", { type: "button", className: "pr-setup-go", textContent: WORDS["setup.continue"] });
    go_.addEventListener("click", () => setupAt(SETUP.indexOf(next)));
    const done = SETUP.length - left.length;
    setupCard.replaceChildren(
      element("header", { className: "pr-setup-top" },
        element("h3", { id: "pr-setup-title", textContent: WORDS.setup }),
        element("span", { className: "pr-count", textContent: `${done + 1} ${WORDS["setup.of"]} ${SETUP.length}` })),
      steps, go_);
    return true;
  }
  // One step of set up, alone in the settings panel.
  function setupAt(index) {
    if (index < 0 || index >= SETUP.length) { go(PLACES.find((p) => p.host === "home").key, true); return; }
    go(PLACES.find((p) => p.show === "settings").key, false, index);
  }
  function paintSetupStep() {
    const panel = $("pr-settings");
    panel.querySelector(".pr-setup-bar")?.remove();
    panel.querySelector(".pr-setup-head")?.remove();
    const step = SETUP[setupStep];
    for (const node of panel.querySelectorAll(".pr-set")) node.hidden = Boolean(step) && node.dataset.section !== step.section;
    panel.classList.toggle("pr-setup-on", Boolean(step));
    if (!step) return;
    $("pr-title").textContent = WORDS.setup;
    $("pr-count").hidden = false;
    $("pr-count").textContent = `${setupStep + 1} ${WORDS["setup.of"]} ${SETUP.length}`;
    panel.prepend(element("h3", { className: "pr-setup-head", textContent: WORDS[step.word] }));
    const button = (word, to, primary = false) => {
      const b = element("button", { type: "button", className: primary ? "pr-setup-go" : "", textContent: word });
      b.addEventListener("click", () => setupAt(to));
      return b;
    };
    const last = setupStep === SETUP.length - 1;
    panel.append(element("nav", { className: "pr-setup-bar" },
      setupStep > 0 ? button(WORDS["setup.back"], setupStep - 1) : element("span"),
      element("span", { className: "pr-setup-right" },
        last ? element("span") : button(WORDS["setup.later"], SETUP.length),
        button(last ? WORDS.done : WORDS["setup.next"], setupStep + 1, true))));
  }

  // One act per place, as PrismSurface names it. Outbound acts are prepared,
  // shown word for word, and leave only on the owner's Send.
  function actForm(place) {
    const act = actOf(place);
    const host = $("pr-act");
    // The act's room is held while it is drawn, and given back when the place has none.
    if (act && act.key !== "none" && place.show !== "search") host.dataset.act = act.key; else delete host.dataset.act;
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

  // A note is kept at its domain's floor label in the design model, never chosen here.
  // The owner's words go through the R4 router first, which maps them onto the
  // Prism's features: when, what it asks of them, and so the places it lands in.
  async function keepNote(place, text, domain = place.domains[0]) {
    if (!vault || !text) return false;
    const { route } = await import("./router/router.mjs");
    const mapped = await route({ source: "note", values: { text }, line, halted });
    if (mapped.refused) { say(WORDS.refused, "bad"); return false; }
    if (mapped.domains.length) domain = mapped.domains[0];
    const label = LABELS[Math.max(...mapped.domains.concat(domain).map((d) => FLOORS[d]))].toLowerCase();
    const about = { domain, media: "plainText", at: Date.now(), domains: mapped.domains, ...(mapped.intent ? { intent: mapped.intent } : {}), ...(mapped.start != null ? { start: mapped.start, allDay: mapped.allDay } : {}) };
    const result = await vault.put(encoder.encode(text), { label, about });
    const kept = result.outcome === "store" ? WORDS.kept : result.outcome === "storehash" ? WORDS["kept.sealed"] : WORDS.refused;
    if (!result.outcome?.startsWith("store")) { say(kept, "bad"); return false; }
    // The place shows the note before the page says it is kept.
    await load();
    if (current.show !== "settings") paintList();
    say(kept, "good");
    // Keeping is a gesture: the Prism answers it and learns from it, after the page has said it is kept.
    gesture(items.find((item) => item.address === result.address), "keep").catch(() => {});
    return true;
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
      keep.disabled = true;
      try {
        if (await keepNote(place, text)) field.value = "";
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
    });
    send.addEventListener("click", async () => {
      if (!pending) return;
      send.disabled = true;
      try {
        const done = await (await routerOf()).send(pending.item, pending.seal);
        say(word(done.answer), done.delivered ? "good" : "bad");
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
    if (result.outcome?.startsWith("store")) { await load(); paintList(); }
  }

  function go(key, focus = false, step = -1) {
    const place = byKey.get(key);
    if (!onPage(place)) return;
    setupStep = step;
    current = place;
    personOpen = null;
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
    $("pr-home").hidden = place.host !== "home";
    setupCard.hidden = true;
    // The home's cards hold their latest items only while the home is shown, so an item is in one place at a time.
    if (place.host !== "home") for (const latest of document.querySelectorAll("#pr-home .pr-card-latest")) latest.textContent = "";
    actForm(place);
    if (settings) { buildSettings(); paintSettings(); paintSetupStep(); }
    else { paintSetup(); paintList(); }
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
    // One panel of the person's settings, in the model's sections and order; a
    // setting in the system view runs on its own and gets no row. A section
    // shows its detail always, until the person has done what it asks, or only
    // on a tap, as the model says.
    const sectionOf = new Map();
    for (const section of SECTIONS) {
      const heading = element("h3", { id: `pr-set-${section.key}`, textContent: section.name });
      const rows = element("div", { className: "pr-rows" });
      const node = element("section", { className: "pr-set" }, heading, rows);
      node.dataset.section = section.key;
      node.setAttribute("aria-labelledby", heading.id);
      $("pr-settings").append(node);
      for (const key of section.settings) sectionOf.set(key, { section, rows });
      if (section.rows === "services") buildServices(section, rows);
    }
    const settingRow = (setting, ...controls) => {
      const state = element("span", { className: "pr-state" });
      const name = element("span", { className: "pr-name", textContent: setting.name });
      const tools = element("span", { className: "pr-controls" }, ...controls);
      const home = sectionOf.get(setting.key);
      const reveal = home?.section.reveal ?? "always";
      if (setting.kind === "switch" || reveal === "always") {
        const row = element("div", { className: "pr-setting" }, name, state, tools);
        if (home && setting.viewpoint === "person") home.rows.append(row);
        return { row, state, done() {} };
      }
      // A detail row: its name and state, and the controls one tap away.
      const row = element("details", { className: "pr-setting pr-detail" }, element("summary", {}, name, state), tools);
      row.setAttribute("aria-label", setting.name);
      let touched = false;
      row.querySelector("summary").addEventListener("click", () => { touched = true; });
      if (home && setting.viewpoint === "person") home.rows.append(row);
      return { row, state, done(flag) { if (reveal === "until-done" && !touched) row.open = !flag; } };
    };
    // Connections: a row per service the Prism declares, drawn from its
    // declaration (app/specs/source/services.json): its state, the steps that
    // connect it with the next one to press, and how to do it.
    let servicesShown = false;
    let repaintDevice = null;
    function buildServices(section, rows) {
      const holder = element("div", { className: "pr-services" });
      rows.prepend(holder);
      (async () => {
        const services = await import("./source/services.mjs");
        const save = (bytes, name) => {
          const link = element("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/zip" })), download: name });
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        };
        const drawn = services.SERVICES.map((service) => {
          const state = element("span", { className: "pr-state" });
          const steps = element("ol", { className: "pr-steps" });
          const row = element("details", { className: "pr-setting pr-detail pr-service" }, element("summary", {}, element("span", { className: "pr-name", textContent: service.name }), state), steps);
          row.setAttribute("aria-label", service.name);
          row.hidden = true;
          let touched = false;
          row.querySelector("summary").addEventListener("click", () => { touched = true; });
          holder.append(row);
          const paint = (report, first) => {
            const now = services.state(service.key, report, { halted: halted() });
            row.hidden = now.state === "off";
            const next = service.connect.find((s) => s.key === now.next);
            const got = report.arrived?.[service.key]?.n ?? 0;
            state.textContent = now.state === "checking" ? WORDS["service.checking"] : now.state === "live" ? (got ? `${got} ${WORDS.items}` : WORDS["service.live"]) : now.state === "paused" ? WORDS.halted : now.state === "refused" ? WORDS["service.refused"] : next?.word ?? "";
            // Only the first service that needs a step opens, so the person meets one thing to do.
            if (section.reveal === "until-done" && !touched) row.open = now.state === "step" && first;
            const doneSteps = new Set(service.connect.filter((s) => services.done(service, s, report)).map((s) => s.key));
            steps.replaceChildren(...service.connect.map((step) => {
              const item = element("li", { className: doneSteps.has(step.key) ? "pr-step pr-step-done" : step === next ? "pr-step pr-step-next" : "pr-step" });
              if (step !== next) { item.append(element("span", { textContent: step.word })); return item; }
              const press = element("button", { type: "button", textContent: step.word });
              press.addEventListener("click", async () => {
                press.disabled = true;
                try { await services.run(service.key, step.key, { save }); } catch (error) { say(error?.message ?? String(error), "bad"); } finally { press.disabled = false; await paintServices(); }
              });
              item.append(press);
              const how = services.howOf(step, report);
              if (how.length > 1) item.append(element("ol", { className: "pr-how" }, ...how.map((line) => element("li", { textContent: line }))));
              return item;
            }));
            return now.state === "step";
          };
          return paint;
        });
        // What the browser reports, or nothing yet if it has not answered within a moment.
        let last = { extension: false, services: {} };
        const paintWith = async (report) => {
          let first = true;
          for (const paint of drawn) if (paint(report, first)) first = false;
          servicesShown = Boolean(holder.querySelector(".pr-service:not([hidden])"));
          servicesLive = services.SERVICES.some((s) => services.state(s.key, report).state === "live");
          await repaintDevice?.();
        };
        const paintServices = async () => {
          await paintWith(last);
          const late = new Promise((done) => setTimeout(() => done(null), 3000));
          const report = await Promise.race([services.probe().catch(() => null), late]);
          last = { ...(report ?? last), arrived: arrivedNow(), imported: importedNow() };
          await paintWith(last);
        };
        painters.push(paintServices);
        // The rows arrive after the panel may already be painted; paint them now.
        paintServices();
        // Coming back from the extension page or the service's tab, the rows say where things stand.
        addEventListener("focus", () => { if (!$("pr-settings").hidden) paintServices(); });
        await paintServices();
      })().catch((error) => console.warn(`connections: ${error?.message ?? error}`));
    }
    const switchFor = (checked, label, onChange) => {
      const box = element("input", { type: "checkbox", checked, role: "switch" });
      box.setAttribute("aria-label", label);
      box.addEventListener("change", () => onChange(box.checked));
      return box;
    };
    const named = (key) => SETTINGS.find((s) => s.key === key);
    const painters = [];

    // Who you are: first, because every "from me" and "to me" depends on it.
    {
      const names = element("input", { type: "text", placeholder: WORDS["identity.names"], autocomplete: "name" });
      names.setAttribute("aria-label", WORDS["identity.names"]);
      const addresses = element("input", { type: "text", placeholder: WORDS["identity.addresses"], autocomplete: "email" });
      addresses.setAttribute("aria-label", WORDS["identity.addresses"]);
      const confirm = element("button", { type: "button", textContent: WORDS["identity.confirm"] });
      const self = settingRow(named("identity"), names, addresses, confirm);
      painters.push(() => {
        const me = meNow();
        if (document.activeElement !== names) names.value = me.names.join(", ");
        if (document.activeElement !== addresses) addresses.value = me.addresses.join(", ");
        self.state.textContent = declared() ? meLine(me) : "";
      });
      confirm.addEventListener("click", () => declare({ names: listOf(names.value), addresses: listOf(addresses.value) }));
    }

    // Sources: this device, through every surface the browser reports. Each
    // control shows only where PrismHost offers it, each read is asked of
    // PrismFolder, and each item is kept through the detectors and the vault.
    (async () => {
      const device = named("device");
      const addFolder = element("button", { type: "button", textContent: WORDS["device.folder"] });
      const contacts = element("button", { type: "button", textContent: WORDS["device.contacts"] });
      const allow = element("button", { type: "button", textContent: WORDS["device.allow"] });
      const forget = element("button", { type: "button", textContent: WORDS.forget });
      const files = element("input", { type: "file", multiple: true, accept: FILE_TYPES });
      files.setAttribute("aria-label", WORDS["device.files"]);
      // Listening from the moment the picker exists: a card's press can open it before the source's code arrives.
      let onFiles = null;
      files.addEventListener("change", async () => {
        while (!onFiles) await new Promise((done) => setTimeout(done, 50));
        await onFiles();
      });
      const filesLabel = element("label", { className: "pr-file" }, element("span", { textContent: WORDS["device.files"] }), files);
      const row = settingRow(device, addFolder, filesLabel, contacts, allow, forget);
      if (!vault) { onFiles = async () => {}; row.state.textContent = WORDS.unavailable; row.row.querySelector(".pr-controls").hidden = true; return; }
      const d = await deviceOf();
      let kept = [];
      const paint = async () => {
        kept = await d.source.folders().catch(() => []);
        const plan = await d.ask({ grant: { folder: kept.some((f) => f.grant === "granted") ? "kept" : "none", extension: extensionGrant() } });
        const shown = (surface) => plan[surface] === "offer" || plan[surface] === "use";
        row.state.textContent = kept.length ? kept.map((f) => f.name).join(", ") : WORDS["device.none"];
        row.done(kept.length > 0 || items.length > 0 || servicesShown);
        addFolder.hidden = !shown("folder");
        filesLabel.hidden = !shown("files");
        contacts.hidden = !shown("contacts");
        allow.hidden = !shown("folder") || !kept.some((f) => f.grant === "prompt");
        forget.hidden = !kept.length;
      };
      const owner = (surface) => async () => (await d.ask({ act: { [surface]: "owner" } }))[surface] === "use";
      const busy = (button, may, work) => async () => {
        button.disabled = true;
        try { if (await may()) await work(); } catch (error) { if (error?.name !== "AbortError") say(error?.code ?? error?.message ?? String(error), "bad"); } finally { button.disabled = false; await paint(); }
      };
      addFolder.addEventListener("click", busy(addFolder, owner("folder"), async () => { await d.source.addFolder(); await reportDevice(await d.source.readFolders()); }));
      allow.addEventListener("click", busy(allow, owner("folder"), async () => { await d.source.allow(); await reportDevice(await d.source.readFolders()); }));
      forget.addEventListener("click", busy(forget, async () => true, async () => { for (const f of kept) await d.source.forget(f.id); }));
      onFiles = busy(files, owner("files"), async () => { await reportDevice(await d.source.readFiles([...(files.files ?? [])])); files.value = ""; });
      contacts.addEventListener("click", busy(contacts, owner("contacts"), async () => {
        const picked = await navigator.contacts.select(["name", "email", "tel"], { multiple: true });
        await reportDevice(await d.source.readContacts(picked));
      }));
      painters.push(paint);
      repaintDevice = paint;
      await paint();
    })().catch((error) => console.warn(`sources: ${error?.message ?? error}`));

    // Attention: Quiet holds what is not urgent.
    settingRow(named("quiet"), switchFor(paceNow === "quiet", named("quiet").name, (on) => {
      paceNow = on ? "quiet" : "open";
      store.set(PACE_KEY, paceNow);
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
    });
    importFile.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      if (!file || !vault) return;
      if (!passphrase.value) { importFile.value = ""; passphrase.focus(); return; }
      const result = await vault.importFrom(new Uint8Array(await file.arrayBuffer()), passphrase.value);
      say(result.outcome === "refuse" ? `${WORDS.refused} · ${result.reason ?? ""}` : WORDS.kept, result.outcome === "refuse" ? "bad" : "good");
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
    });
    halt.id = "pr-halt";
    settingRow(named("halt"), halt);

    paintSettings = () => { for (const paint of painters) paint(); };
  }

  // Ask: the answer is the owner's own kept items that meet the question
  // (its words, the span it names, the domains it names), shown only as the
  // Boundary allows at the highest label among them.
  const drawn = element("ol", { className: "pr-list pr-drawn" });
  drawn.setAttribute("aria-label", WORDS["ask.placeholder"]);
  // The chat: earlier turns above, the answer now in the result, then where
  // it came from (each a link that opens it) and the decision it offers.
  const chat = element("ol", { className: "pr-chat" });
  chat.setAttribute("aria-label", PLACES.find((p) => p.host === "composer")?.name ?? WORDS["ask.placeholder"]);
  const more = element("div", { className: "pr-said-more" });
  out.before(chat);
  out.after(more);
  more.after(drawn);
  let lastTurn = null;
  const writePlace = () => PLACES.find((p) => p.act === "write" && onPage(p));
  const notePlace = () => (current.act === "note" ? current : PLACES.find((p) => p.act === "note" && onPage(p)));
  async function offer(kind, item, prompt) {
    if (kind === "done" && item) { clear(item); say(WORDS.done, "good"); return; }
    if (kind === "connect") { setupAt(SETUP.findIndex((s) => s.key === "sources")); return; }
    if (kind === "keep") { const place = notePlace(); if (place) await keepNote(place, prompt); return; }
    if (kind === "reply" && item) {
      const place = writePlace();
      if (!place) return;
      go(place.key, true);
      const { partiesOf } = await coherence();
      const to = partiesOf(item)[0]?.address ?? "";
      const field = $("pr-act").querySelector("input[type=email]");
      if (field) field.value = to;
      $("pr-act").querySelector("textarea")?.focus();
    }
  }
  function turn(prompt, said) {
    // The turn before moves up with what was said; this one shows its words above the answer.
    if (lastTurn) lastTurn.node.append(element("p", { className: "pr-said", textContent: lastTurn.said }));
    const node = element("li", { className: "pr-turn" }, element("p", { className: "pr-you", textContent: prompt }));
    chat.append(node);
    node.scrollIntoView({ block: "nearest" });
    lastTurn = { node, said: said.sentences.join(" ") };
    const rows = said.sources.map(rowOf);
    drawn.replaceChildren(...rows);
    const links = said.sources.map((item, i) => {
      const link = element("a", { href: "#", className: "pr-source", textContent: item.title || item.who || "—" });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const row = rows[i];
        if (row.getAttribute("aria-expanded") === "false") row.click();
        row.scrollIntoView({ block: "nearest" });
      });
      return link;
    });
    const offers = (said.offers ?? []).map(({ kind, item }) => {
      const label = { reply: WORDS.reply, done: WORDS.done, keep: WORDS.keep, connect: WORDS.connect }[kind];
      if (!label) return null;
      const button = element("button", { type: "button", className: "pr-offer", textContent: label });
      button.addEventListener("click", () => { button.disabled = true; offer(kind, item, prompt).catch((error) => say(error?.message ?? String(error), "bad")); });
      return button;
    }).filter(Boolean);
    more.replaceChildren(...(links.length ? [element("p", { className: "pr-sources" }, ...links)] : []), ...(offers.length ? [element("div", { className: "pr-offers" }, ...offers)] : []));
  }
  out.style.whiteSpace = "pre-line";
  out.style.minWidth = "0";
  if (out.parentElement) Object.assign(out.parentElement.style, { minWidth: "0", flex: "1 1 0" });
  $("pr-ask").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("pr-prompt").value.trim();
    if (!prompt) return;
    $("pr-ask-go").disabled = true;
    try {
      // The person's words go through the R4 router; a question is answered in
      // sentences from what is held, under the Boundary, with what it drew on.
      const { answer } = await import("./router/answer.mjs");
      const said = await answer(prompt, { items: haltedNow ? [] : items, line, halted, me: meNow(), keep: false });
      turn(prompt, said);
      if (said.sentences.length) { say(said.sentences.join(" "), "good"); $("pr-prompt").value = ""; }
      else if (haltedNow) say(WORDS.halted, "bad");
      else if (said.refused) say(WORDS["answer.asks"], "warn");
      else say(WORDS["answer.none"], "");
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
  // The voice comes with the owner's first gesture, never before it.
  const voice = () => import("./voice.mjs").catch((error) => console.warn(`voice: ${error?.message ?? error}`));
  addEventListener("pointerdown", voice, { once: true, capture: true });
  addEventListener("keydown", voice, { once: true, capture: true });
  root.classList.add("pr-ready");
  // The look's gesture fonts (FONTS): the page opens in their metric-matched
  // fallback and fetches nothing for them; they come with the first touch, or
  // at once when this browser already keeps them.
  const fonts = () => Promise.all(FONTS.map(async (f) => {
    const face = new FontFace(f.family, `url(${new URL(`./fonts/${f.file}`, import.meta.url).href})`, { weight: String(f.weight), display: "swap" });
    document.fonts.add(await face.load());
  })).catch(() => {});
  (async () => {
    const kept = globalThis.caches && (await Promise.all(FONTS.map((f) => caches.match(new URL(`./fonts/${f.file}`, import.meta.url).href)))).every(Boolean);
    if (FONTS.length && kept) fonts();
    else for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, fonts, { once: true, capture: true });
  })().catch(() => {});
  // Resonance loads on the owner's first touch, never with the page, then orders what they resonate with first.
  const wake = () => resonanceOf().then((made) => { if (made && current.show !== "settings") paintList(); });
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, wake, { once: true, capture: true });
  readOnVisit().catch((error) => console.warn(`sources: ${error?.message ?? error}`));
}
