// The Prism's own surface. Every decision is the verified app's: this script
// only carries text between the page, the vault, R4 and the root guest.
import { openVault, routerDecide } from "./vault/vault.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The halt switch is a convenience of this device. It is read on every
// question, so the Boundary sees "halted yes" the moment it is ticked.
const HALT_KEY = "me.halted";
function readHalt() {
  try { return localStorage.getItem(HALT_KEY) === "yes"; } catch { return false; }
}
function writeHalt(on) {
  try { localStorage.setItem(HALT_KEY, on ? "yes" : "no"); } catch { /* private window: the switch still holds for this page */ }
}

// Google's consent return, when this window is one. The relay and its sealing
// load only then, so an ordinary visit fetches none of it.
async function relayConsent() {
  if (!/(?:^#|&)state=/.test(location.hash)) return false;
  return (await import("./google/relay.mjs")).relayConsent();
}

export default async function start({ app, reason, $ }) {
  // This window may be Google's return with the owner's consent: hand it back and close.
  if (await relayConsent()) return;
  const out = $("me-out");
  const log = $("me-log");
  const halt = $("me-halt");
  let haltedNow = readHalt();
  halt.checked = haltedNow;
  const halted = () => (haltedNow ? "yes" : "no");

  function say(text, state = "") {
    out.textContent = text;
    out.className = state;
  }
  function remember(what, answer) {
    const row = document.createElement("li");
    const req = document.createElement("span");
    req.textContent = what.length > 28 ? `${what.slice(0, 26)}…` : what;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = answer.length > 18 ? `${answer.slice(0, 16)}…` : answer;
    row.append(req, tag);
    log.prepend(row);
    while (log.children.length > 30) log.lastChild.remove();
  }

  if (!app) {
    say(`The app is ${reason || "not available"}, so nothing is kept, read or asked.`, "bad");
    for (const control of document.querySelectorAll(".me button, .me input, .me select, .me textarea, .me-controls input, .me-controls button")) control.disabled = true;
    return;
  }

  // The root guest: "<facet> <rest>" in, the facet's answer out.
  const line = async (text) => decoder.decode(await app.dispatch(encoder.encode(text))).trim();

  halt.addEventListener("change", () => {
    haltedNow = halt.checked;
    writeHalt(haltedNow);
    say(haltedNow ? "Halted. The Boundary denies every move until you untick it." : "Running.", haltedNow ? "bad" : "good");
    remember("halt", halted());
  });

  // Direct questions to the model, for anyone who wants to see a decision.
  $("me-check").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("me-line").value.trim();
    if (!text) return;
    const answer = await line(text);
    say(answer, answer === "invalid request" || answer === "invalid" ? "refuse" : "");
    remember(text, answer);
  });

  // The vault: kept in this browser, every keep and read decided by the app.
  let vault = null;
  async function count() {
    const items = await vault.list();
    const where = await vault.persist();
    $("me-count").textContent = `${items.length} kept in this browser${where?.persisted ? ", protected from eviction" : ""}.`;
  }
  try {
    vault = await openVault({ decide: routerDecide(line), halted });
    await count();
  } catch (error) {
    $("me-count").textContent = `The vault could not open: ${error?.message ?? error}`;
  }

  // Connections: one row per source, each deciding through the root.
  if (vault) {
    try {
      // The Google row loads once the platform has published its client;
      // until then one line says so and none of the Google code is fetched.
      const platform = await fetch(new URL("./google/platform.json", import.meta.url), { cache: "no-cache" }).then((response) => response.json());
      if (platform.clientId) {
        const { mountGoogle } = await import("./google/panel.mjs");
        await mountGoogle($("me-connections"), { vault, line, halted });
      } else {
        const note = Object.assign(document.createElement("p"), { className: "me-note", textContent: "Gmail and Calendar turn on here once the platform publishes its Google client." });
        $("me-connections").replaceChildren(note);
      }
      $("me-conn").hidden = false;
    } catch (error) {
      console.warn(`connections: ${error?.message ?? error}`);
    }
  }

  $("me-keep").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fact = $("me-fact").value;
    if (!fact || !vault) return;
    const label = $("me-label").value;
    const result = await vault.put(encoder.encode(fact), { label });
    say(result.outcome === "store" ? "Kept." : result.outcome === "storehash" ? "Kept as a keyed hash only." : `Not kept: ${result.outcome}.`, result.outcome?.startsWith("store") ? "good" : "bad");
    remember(`keep (${label})`, result.outcome);
    if (result.outcome?.startsWith("store")) $("me-fact").value = "";
    await count();
  });

  $("me-export").addEventListener("click", async () => {
    if (!vault) return;
    // The one place a passphrase is asked: an export leaves this browser's key behind.
    const passphrase = prompt("A passphrase for this export. You will need it to import it.");
    if (!passphrase) return;
    const bytes = await vault.exportTo(passphrase);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    link.download = "prism-export.pvx";
    link.click();
    URL.revokeObjectURL(link.href);
    remember("export", `${bytes.length} bytes`);
  });

  $("me-import").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file || !vault) return;
    const passphrase = prompt("The passphrase this export was made with.");
    if (!passphrase) return;
    const result = await vault.importFrom(new Uint8Array(await file.arrayBuffer()), passphrase);
    say(result.outcome === "refuse" ? `Not imported: ${result.reason ?? "refused"}.` : "Imported.", result.outcome === "refuse" ? "bad" : "good");
    remember("import", result.outcome ?? "done");
    event.target.value = "";
    await count();
  });

  // R4: opened on the first question, so the page itself stays light.
  let r4 = null;
  async function openModel() {
    if (r4) return r4;
    const [{ openR4 }, { guestDecider }] = await Promise.all([import("./r4/r4.mjs"), import("./r4/decide.mjs")]);
    const lock = await fetch(new URL("./r4/r4.lock.json", import.meta.url)).then((response) => response.json());
    $("me-r4-state").textContent = "Loading the language model into this browser…";
    r4 = await openR4({
      lock,
      decide: guestDecider(app.dispatch),
      boundary: (fields) => line(`boundary ${fields}`),
    });
    $("me-r4-state").textContent = r4.engine.state === "match" ? "The language model runs in this browser." : `The language model did not load: ${r4.engine.reasons.join(", ") || r4.engine.state}.`;
    return r4;
  }

  $("me-ask").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("me-prompt").value.trim();
    if (!prompt) return;
    $("me-ask-go").disabled = true;
    try {
      const model = await openModel();
      const result = await model.ask({ prompt, context: { label: "confidential", halted: halted() } });
      if (result.outcome === "answer") say(result.answer, "good");
      else if (result.outcome === "ask" && result.release) say("The Boundary asks before showing this answer.", "warn");
      else say(`No answer: ${result.outcome}.`, "bad");
      remember(prompt, result.outcome);
    } catch (error) {
      say(`No answer: ${error?.message ?? error}`, "bad");
    } finally {
      $("me-ask-go").disabled = false;
    }
  });
}
