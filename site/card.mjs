// The Prism's surface. Every place, act, setting and word is PrismSurface's
// (site/surface/surface.mjs, generated with the model), and every decision is
// the verified app's: this script only carries bytes between the page, the
// vault, R4, the routed models and the root guest.
import { openVault, routerDecide } from "./vault/vault.mjs";
import { PLACES, ACTS, LABELS, FLOORS, GROUPS, SETTINGS, WORDS, DOMAINS } from "./surface/surface.mjs";
import { readItem } from "./surface/read.mjs";

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

const day = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
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

  // The destinations router: PrismDest and the Boundary decide every hand-off.
  let router = null;
  const routerOf = async () => {
    if (router) return router;
    const { makeRouter } = await import("./dest/dest.mjs");
    router = makeRouter({ line, halted, pace });
    return router;
  };

  // --- Places ---
  const byKey = new Map(PLACES.map((p) => [p.key, p]));
  const actOf = (place) => ACTS.find((a) => a.key === place.act);
  let current = byKey.get(store.get(PLACE_KEY, "")) ?? PLACES.find((p) => p.host === "home");
  let query = "";

  function rowOf(item) {
    const what = item.sealed ? WORDS.sealed : item.title || "—";
    return element("li", { className: `pr-item${item.sealed ? " pr-sealed" : ""}` },
      element("span", { className: "pr-when", textContent: when(item.at) }),
      element("span", { className: "pr-what", textContent: what }),
      element("span", { className: "pr-who", textContent: item.who || DOMAINS[item.domain] || "" }));
  }

  function paintList() {
    const list = $("pr-list");
    let shown = items.filter((item) => current.domains.includes(item.domain));
    if (current.show === "search") {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      shown = words.length ? items.filter((item) => words.every((w) => `${item.title} ${item.who} ${item.text}`.toLowerCase().includes(w))) : [];
    }
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
        return { target: "calendar", cause: "owner", text, payload: { uid: `${crypto.randomUUID()}@me`, start, end: new Date(start.getTime() + 3600_000), summary: subject, description: text } };
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
        if (done.delivered) { pending = null; send.hidden = true; form.reset(); preview.hidden = true; }
      } finally {
        send.disabled = false;
      }
    });
    return form;
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
    $("pr-title").textContent = place.host === "home" ? `${place.name} · ${day.format(new Date())}` : place.name;
    const settings = place.show === "settings";
    $("pr-settings").hidden = !settings;
    $("pr-list").hidden = settings;
    $("pr-count").hidden = settings;
    actForm(place);
    if (settings) paintSettings();
    else paintList();
    if (focus) $("pr-title").focus({ preventScroll: false });
  }
  $("pr-title").tabIndex = -1;
  for (const button of document.querySelectorAll(".pr-go")) button.addEventListener("click", () => go(button.dataset.place, true));

  // --- The Boundary's settings: every route in and out, and the stop ---
  let paintSettings = () => {};
  {
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

    // Sources: Google, once the platform publishes its client.
    (async () => {
      const gmail = settingRow(named("gmail"));
      const gcal = settingRow(named("gcal"));
      let platform = {};
      try { platform = await fetch(new URL("./google/platform.json", import.meta.url), { cache: "no-cache" }).then((r) => r.json()); } catch { /* unavailable below */ }
      if (!platform.clientId || !vault) {
        gmail.state.textContent = WORDS.unavailable;
        gcal.state.textContent = WORDS.unavailable;
        return;
      }
      const [{ connectGoogle, popupAuthorize }, { ingestInto }] = await Promise.all([import("./google/google.mjs"), import("./google/ingest.mjs")]);
      const google = connectGoogle({
        decide: (rest) => line(`google ${rest}`),
        link: (rest) => line(`googlelink ${rest}`),
        platform,
        authorize: popupAuthorize({ clientId: platform.clientId, redirectUri: platform.relay }),
        ingest: ingestInto({ vault }),
        halted,
      });
      await google.ready;
      for (const [service, row, config] of [["gmail", gmail, platform.mail], ["calendar", gcal, platform.calendar]]) {
        const connect = element("button", { type: "button", textContent: WORDS.connect });
        const read = element("button", { type: "button", textContent: WORDS["read.now"] });
        const forget = element("button", { type: "button", textContent: WORDS.forget });
        row.row.querySelector(".pr-controls").append(connect, read, forget);
        const paint = () => {
          const s = google.status()[service];
          row.state.textContent = s.token === "fresh" ? WORDS.on : WORDS.off;
          connect.hidden = s.token === "fresh";
          read.hidden = s.token !== "fresh";
          forget.hidden = s.stage === "unprovisioned" || s.token !== "fresh";
        };
        const busy = (button, work) => async () => {
          button.disabled = true;
          try { await work(); } catch (error) { say(error?.code ?? error?.message ?? String(error), "bad"); } finally { button.disabled = false; paint(); }
        };
        connect.addEventListener("click", busy(connect, () => google.grant([service])));
        read.addEventListener("click", busy(read, async () => {
          const sync = service === "gmail" ? google.syncMail : google.syncCalendar;
          const t = await sync({ ...config, onProgress: (p) => say(`${p.store + p.storehash + p.ask + p.refuse + p.other} / ${p.total}`, "") });
          say(`${t.store + t.storehash} ${WORDS.items}`, "good");
          remember(named(service === "gmail" ? "gmail" : "gcal").name, `${t.store + t.storehash}`);
          await load();
        }));
        forget.addEventListener("click", busy(forget, () => google.forget()));
        painters.push(paint);
        paint();
      }
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
  async function answer(prompt, context) {
    const r4model = await openModel();
    if (grants().length) {
      const routed = await openRouted();
      const target = routed.route("text-generation");
      if (target) {
        const decision = await routed.prepare(target);
        if (decision.outcome === "run") {
          routed.connect(r4model, { maxTokens: 128 });
          return r4model.askRouted({ target, prompt, context });
        }
      }
    }
    return r4model.ask({ prompt, context });
  }
  $("pr-ask").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("pr-prompt").value.trim();
    if (!prompt) return;
    $("pr-ask-go").disabled = true;
    try {
      const result = await answer(prompt, { label: "confidential", halted: halted() });
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
}
