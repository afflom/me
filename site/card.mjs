// The Prism's surface. Every place, act, setting and word is PrismSurface's
// (site/surface/surface.mjs, generated with the model), and every decision is
// the verified app's: this script only carries bytes between the page, the
// vault, R4, the routed models and the root guest.
import { openVault, routerDecide } from "./vault/vault.mjs";
import { PLACES, ACTS, LABELS, FLOORS, SETTINGS, WORDS, DOMAINS, FEEDERS } from "./surface/surface.mjs";
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

const RANK = ["public", "internal", "confidential", "restricted"];
const higher = (a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a);

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
    const { domainsOf, peopleOf, peoplePlace, between } = rows.length ? await coherence() : {};
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
    // The people in what is kept, for the place that lists them.
    people = peopleOf ? { place: peoplePlace, all: peopleOf(items), between } : null;
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
  const FILE_TYPES = ".zip,.mbox,.mbx,.eml,.ics,.ical,.vcf,.vcard";
  const emptyRow = () => element("li", { className: "pr-empty", textContent: WORDS.empty });

  // Today: the agenda ahead (PrismChronology says what falls today and what
  // clashes), then what came in lately, then what is to do.
  const relate = async (a, b, c, d) => line(`when ${a} ${b} ${c} ${d}`);
  let painting = 0;
  async function paintToday(list) {
    const turn = ++painting;
    // The home's cards count every place and offer each one's feeder.
    homeCards();
    list.hidden = !items.length;
    if (!items.length) { list.replaceChildren(emptyRow()); return; }
    const { today, lineOf } = await coherence();
    const { agenda, recent, tasks, needs } = await today(items, { relate, done: doneSet() });
    if (turn !== painting || current.host !== "home") return;
    const rows = [];
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
  for (const button of document.querySelectorAll("#pr-home .pr-card-feed")) {
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
    if (mapped.refused) { say(haltedNow ? WORDS.halted : WORDS.refused, "bad"); return false; }
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

  function go(key, focus = false) {
    const place = byKey.get(key);
    if (!onPage(place)) return;
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
    // The home's cards hold their latest items only while the home is shown, so an item is in one place at a time.
    if (place.host !== "home") for (const latest of document.querySelectorAll("#pr-home .pr-card-latest")) latest.textContent = "";
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
    // One sheet of the person's settings, in the model's order; a setting in
    // the system view runs on its own and gets no row.
    const rows = element("div", { className: "pr-rows" });
    $("pr-settings").append(element("section", { className: "pr-set" }, rows));
    const settingRow = (setting, ...controls) => {
      const state = element("span", { className: "pr-state" });
      const row = element("div", { className: "pr-setting" }, element("span", { className: "pr-name", textContent: setting.name }), state, element("span", { className: "pr-controls" }, ...controls));
      if (setting.viewpoint === "person") rows.append(row);
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
      const files = element("input", { type: "file", multiple: true, accept: FILE_TYPES });
      files.setAttribute("aria-label", WORDS["device.files"]);
      // Listening from the moment the picker exists: a card's press can open it before the source's code arrives.
      let onFiles = null;
      files.addEventListener("change", async () => {
        while (!onFiles) await new Promise((done) => setTimeout(done, 50));
        await onFiles();
      });
      const filesLabel = element("label", { className: "pr-file" }, element("span", { textContent: WORDS["device.files"] }), files);
      const row = settingRow(device, addFolder, filesLabel, contacts, getExtension, allow, read, forget);
      if (!vault) { onFiles = async () => {}; row.state.textContent = WORDS.unavailable; row.row.querySelector(".pr-controls").hidden = true; return; }
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
      onFiles = busy(files, owner("files"), async () => { await reportDevice(await d.source.readFiles([...(files.files ?? [])])); files.value = ""; });
      contacts.addEventListener("click", busy(contacts, owner("contacts"), async () => {
        const picked = await navigator.contacts.select(["name", "email", "tel"], { multiple: true });
        await reportDevice(await d.source.readContacts(picked));
      }));
      painters.push(paint);
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
  out.after(drawn);
  out.style.whiteSpace = "pre-line";
  out.style.minWidth = "0";
  if (out.parentElement) Object.assign(out.parentElement.style, { minWidth: "0", flex: "1 1 0" });
  $("pr-ask").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("pr-prompt").value.trim();
    if (!prompt) return;
    $("pr-ask-go").disabled = true;
    try {
      const { drawOn, lineOf } = await coherence();
      // While halted nothing kept is drawn on, and the Boundary denies.
      const used = haltedNow ? [] : drawOn(items, prompt);
      const label = used.reduce((at, item) => higher(at, item.label ?? "confidential"), "confidential");
      const word = await line(`boundary ${label} none browser none yes ${halted()}`);
      const shown = word === "allow" ? used : [];
      drawn.replaceChildren(...shown.map(rowOf));
      let text = shown.length ? shown.map(lineOf).join("\n") : "";
      let state = shown.length ? "good" : "";
      if (!shown.length) {
        if (haltedNow) { text = WORDS.halted; state = "bad"; }
        else if (word === "ask") { text = WORDS["answer.asks"]; state = "warn"; }
        else if (word === "hashonly" && used.length) text = WORDS.sealed;
        else text = WORDS["answer.none"];
      }
      say(text, state);
      if (shown.length) $("pr-prompt").value = "";
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
  // Resonance loads on the owner's first touch, never with the page, then orders what they resonate with first.
  const wake = () => resonanceOf().then((made) => { if (made && current.show !== "settings") paintList(); });
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, wake, { once: true, capture: true });
  readOnVisit().catch((error) => console.warn(`sources: ${error?.message ?? error}`));
}
