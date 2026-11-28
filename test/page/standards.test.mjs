// The front end implements its standards in full, and the registry says how
// each requirement is enforced. Every requirement of every standard that
// governs the page (app/specs/standards/register/) names the check that holds
// it, and this suite runs exactly those checks, read from the registry:
//   "axe-core rules: a, b"  the pinned axe-core engine's rules, on every screen
//   "absent: <selector>"    a verified not-applicable: nothing on any screen,
//                           the frame's shadow roots included, matches it
//   "probe: <name>"         one of the probes below, each a requirement's own
//                           test procedure (W3C's Understanding documents)
//   "suite: <words>"        another suite, named by the entry's "suite"
// A requirement that fails and is not on the standard's debt
// (app/specs/standards/debt/) fails this suite, and so does debt that now
// passes, so the debt only shrinks.
//
// The walk is on the specifications' own examples (test/oracle/corpus.json)
// on the day they happen, at a desktop and a phone width, in light and dark:
// the first visit, every place in the person's view, an opened item,
// Settings and an answer.
//
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/standards.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium, faults, open, serve } from "../product/harness.mjs";

const { PLACES } = await import(resolve("site/surface/surface.mjs"));
const { example, toOf } = await import(resolve("test/oracle/examples.mjs"));

// The registry's entries whose requirements name this suite.
const SUITE = "test/page/standards.test.mjs";
// QR-20's measure: requirements failing beyond the debt, at most 0.
const MEASURE = "wcag-failing";
const { standards: REGISTRY, debt: DEBTS } = (await import(resolve("tools/specs/record.mjs"))).load("app/specs/standards/spec.json");
// A standard may enforce every requirement of a kind alike ("enforcedByKind"): its checks fail as that kind.
const enforcing = (s) => [...Object.entries(s.enforcedBy ?? {}), ...Object.entries(s.enforcedByKind ?? {}).map(([kind, e]) => [`every ${kind}`, e])];
const STANDARDS = REGISTRY.filter((s) => enforcing(s).some(([, e]) => e.suite === SUITE));
// Each requirement's check, parsed from its "how".
const CHECKS = STANDARDS.flatMap((s) => enforcing(s).filter(([, e]) => e.suite === SUITE).map(([id, e]) => {
  const [, kind, arg] = /^(axe-core rules|absent|probe): (.+)$/.exec(e.how) ?? [];
  assert.ok(kind, `${s.key} ${id}: "${e.how}" is not a check this suite knows`);
  return { standard: s.key, id, kind, arg: kind === "axe-core rules" ? arg.split(/,\s*/) : arg };
}));
const RULES = [...new Set(CHECKS.filter((c) => c.kind === "axe-core rules").flatMap((c) => c.arg))];
const ABSENT = [...new Set(CHECKS.filter((c) => c.kind === "absent").map((c) => c.arg))];
const PROBED = new Set(CHECKS.filter((c) => c.kind === "probe").map((c) => c.arg));
const ENGINE = STANDARDS.find((s) => s.engine?.name === "axe-core")?.engine;

async function engine(pin = ENGINE) {
  const dir = join(tmpdir(), "prism-standards");
  // A pin the repository keeps is read there; an engine is fetched once and kept beside the tests.
  const kept = join("app/specs/standards/texts", pin.sha256), path = existsSync(kept) ? kept : join(dir, pin.sha256);
  const bytes = existsSync(path) ? readFileSync(path) : Buffer.from(await (await fetch(pin.url)).arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, pin.sha256, `${pin.url} is ${digest}, not the pinned engine`);
  existsSync(path) || (mkdirSync(dir, { recursive: true }), writeFileSync(path, bytes));
  return bytes.toString("utf8");
}

// The day of the examples: three meetings (two clash), two messages and a card.
const DAY = "1997-07-01T15:00:00Z";
const FEED = [["rfc5546-9", "ics"], ["rfc5546-6", "ics"], ["rfc5546-1", "ics"], ["rfc5322-1", "eml"], ["rfc5322-6", "eml"], ["rfc6350-9", "vcf"]];
const VIEWS = [
  { name: "desktop light", viewport: { width: 1280, height: 800 }, colorScheme: "light" },
  { name: "desktop dark", viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
  { name: "phone light", viewport: { width: 390, height: 844 }, colorScheme: "light" },
  { name: "phone dark", viewport: { width: 390, height: 844 }, colorScheme: "dark" },
];

// In the page: every element, the frame's shadow roots included.
const DEEP = `const deep = (root = document) => [...root.querySelectorAll("*")].flatMap((el) => el.shadowRoot ? [el, ...deep(el.shadowRoot)] : [el]);
const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return (r.width > 0 || r.height > 0 || s.display === "contents") && s.visibility !== "hidden" && !el.closest("[hidden], details:not([open]) > :not(summary)"); };
const active = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };`;
const inPage = (body) => new Function("arg", `${DEEP}\n${body}`);

// Probes run on every screen: each returns the failures it found.
const SCREEN = {
  // 1.3.2: each list's items are read in the order they are seen (rows top to bottom, a row left to right).
  "reading-order": inPage(`const bad = [];
    for (const list of deep().filter((el) => /^(UL|OL)$/.test(el.tagName) && shown(el))) {
      const items = [...list.children].filter((li) => shown(li) && li.getBoundingClientRect().height > 0).map((li) => li.getBoundingClientRect());
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1], b = items[i];
        if (b.top < a.top - 2 || (Math.abs(b.top - a.top) <= 2 && b.left < a.left - 1)) { bad.push((list.id || list.className) + " item " + (i + 1)); break; }
      }
    }
    return bad;`),
  // 1.3.3: no instruction leans on shape, place, size or colour (WCAG failure F14).
  "sensory-words": inPage(`const text = document.body.innerText;
    const hit = /\\b(click|press|tap|select|use)\\b[^.\\n]{0,30}\\b(left|right|above|below|round|square|green|red|blue|yellow|big|small)\\b/i.exec(text);
    return hit ? [hit[0]] : [];`),
  // 2.4.6: every heading and every label says something (that each control has a name is axe-core's, under 4.1.2).
  "headings-labels": inPage(`return deep().filter((el) => (/^H[1-6]$/.test(el.tagName) || el.tagName === "LABEL") && shown(el) && !el.textContent.trim()).map((el) => "empty " + el.tagName.toLowerCase());`),
  // 4.1.3: the Prism's line is a live region, so what it says is announced without moving focus.
  "status-messages": inPage(`const out = document.getElementById("pr-out");
    const live = out?.closest('[aria-live]:not([aria-live="off"]), [role=status], [role=log], [role=alert]') ?? (/^(status|log|alert)$/.test(out?.getAttribute("role") ?? "") ? out : null);
    return live ? [] : ["#pr-out is in no live region"];`),
  // 2.4.5: more than one way to every place: the navigation names each, and Ask finds anything.
  "multiple-ways": inPage(`const bad = [];
    for (const key of arg) if (!document.querySelector('.pr-go[data-place="' + key + '"]')) bad.push("no way to " + key);
    if (!document.getElementById("pr-prompt")) bad.push("no Ask");
    return bad;`),
  // 2.2.2, 2.3.1: nothing moves on its own without end, and nothing flashes more than three times a second.
  "endless-motion": inPage(`const bad = [];
    for (const a of document.getAnimations({ subtree: true })) {
      const t = a.effect?.getComputedTiming?.() ?? {};
      if (a.playState === "running" && t.iterations === Infinity) bad.push("endless " + (a.animationName ?? a.id ?? "animation") + " on " + (a.effect?.target?.id || a.effect?.target?.className || "?"));
      if (a.playState === "running" && t.iterations > 3 && t.duration < 333) bad.push("flash " + (a.animationName ?? ""));
    }
    return bad;`),
  // 1.4.11: a field's edge, which is how it is seen as a field, has 3:1 against what is behind it.
  "non-text-contrast": inPage(`const paint = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
    // Any CSS colour (rgb, oklab, color-mix...) as the sRGB the screen shows.
    const rgb = (c) => { if (!c) return null; paint.clearRect(0, 0, 1, 1); paint.fillStyle = "rgba(0, 0, 0, 0)"; paint.fillStyle = c; paint.fillRect(0, 0, 1, 1); const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
    const behind = (el) => { const chain = []; for (let n = el.parentElement ?? el.getRootNode().host; n; n = n.parentElement ?? n.getRootNode().host) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { chain.push(c); if (c.a >= 1) break; } } let base = chain.at(-1)?.a >= 1 ? chain.pop() : (matchMedia("(prefers-color-scheme: dark)").matches ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }); for (const c of chain.reverse()) base = over(c, base); return base; };
    const bad = [];
    // The edge may be the field's own or that of the box drawn tight around it.
    const seenOf = (el) => {
      const s = getComputedStyle(el);
      const back = behind(el);
      const fill = rgb(s.backgroundColor);
      const face = fill && fill.a > 0 ? over(fill, back) : back;
      const edge = rgb(s.borderTopColor);
      const width = parseFloat(s.borderTopWidth);
      return Math.max(width > 0 && edge && edge.a > 0 ? ratio(over(edge, back), back) : 0, ratio(face, back));
    };
    for (const el of deep().filter((el) => el.matches('input:not([type=hidden]):not([type=file]), textarea, [role=switch]') && shown(el))) {
      const box = el.getBoundingClientRect();
      let seen = seenOf(el);
      for (let up = el.parentElement ?? el.getRootNode().host, i = 0; seen < 3 && up && i < 3; up = up.parentElement ?? up.getRootNode().host, i++) {
        const r = up.getBoundingClientRect();
        if (r.height > box.height + 24) break;
        seen = Math.max(seen, seenOf(up));
      }
      if (seen < 3) bad.push((el.id || el.getAttribute("aria-label") || el.tagName.toLowerCase()) + " " + seen.toFixed(2) + ":1");
    }
    return bad;`),
};

// Probes run once a view, on a place with its content: each returns its failures by requirement.
async function viewProbes(page, view, home, probed = PROBED) {
  const out = [];
  const fail = (probe, why) => out.push({ probe, why });
  const where = () => page.evaluate(() => [document.getElementById("pr-title")?.textContent, document.documentElement.className, location.hash].join("|"));
  if (probed.has("keyboard")) {
    // 2.1.1, 2.1.2, 2.4.7, 2.4.11, 3.2.1: Tab reaches every control, comes round again, each shows its focus
    // and is not hidden under anything, and focusing changes nothing.
    await page.evaluate(() => { document.activeElement?.blur?.(); window.__reached = new WeakSet(); window.scrollTo(0, 0); });
    const before = await where();
    const seen = [];
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(inPage(`const el = active();
        if (!el || el === document.body) return null;
        const again = (window.__reached ??= new WeakSet()).has(el); window.__reached.add(el);
        const target = getComputedStyle(el).display === "contents" ? el.parentElement : el;
        const s = getComputedStyle(el), t = getComputedStyle(target);
        // A ring may be drawn on the control, on the row it lends its cells to, or on its ::before or ::after.
        const ring = (x) => (x.outlineStyle !== "none" && parseFloat(x.outlineWidth) > 0) || (x.boxShadow && x.boxShadow !== "none");
        const r = target.getBoundingClientRect();
        const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
        const top = (x, y) => { let e = document.elementFromPoint(x, y); while (e?.shadowRoot) { const inner = e.shadowRoot.elementFromPoint(x, y); if (!inner || inner === e) break; e = inner; } return e; };
        const clear = points.some(([x, y]) => { const e = top(x, y); return e && (e === el || e === target || el.contains(e) || target.contains(e) || e.contains(el)); });
        return { again, id: el.id || el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30) || el.tagName, key: el.id + "|" + el.className + "|" + el.textContent.trim().slice(0, 40) + "|" + Math.round(r.left) + "," + Math.round(r.top), ring: ring(s) || ring(t) || ring(getComputedStyle(el, "::before")) || ring(getComputedStyle(el, "::after")), clear };`));
      if (!f) continue;
      if (f.again || (seen.length && f.key === seen[0].key)) break;
      seen.push(f);
      if (!f.ring) fail("keyboard", `2.4.7 ${f.id} shows no focus`);
      if (!f.clear) fail("keyboard", `2.4.11 ${f.id} is hidden when focused`);
    }
    if (seen.length >= 160) fail("keyboard", "2.1.2 Tab does not come round");
    const missing = await page.evaluate(inPage(`return deep().filter((el) => el.matches('button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea, select, a[href], [tabindex="0"]') && shown(el) && !window.__reached?.has(el))
      .map((el) => { const r = (getComputedStyle(el).display === "contents" ? el.parentElement : el).getBoundingClientRect(); return { id: el.id || el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30) || el.tagName, key: el.id + "|" + el.className + "|" + el.textContent.trim().slice(0, 40) + "|" + Math.round(r.left) + "," + Math.round(r.top) }; });`));
    // A control drawn again while the walk ran is the one reached where it stood.
    for (const m of missing) if (!seen.some((f) => f.key === m.key)) fail("keyboard", `2.1.1 Tab never reaches ${m.id}`);
    if ((await where()) !== before) fail("keyboard", "3.2.1 focusing changed the page");
  }
  if (probed.has("character-keys")) {
    // 2.1.4: no single printable key does anything unless focus is on its control.
    for (const key of [..."abcdefghijklmnopqrstuvwxyz0123456789.,/;'[]-=?"]) {
      await page.evaluate(() => { document.activeElement?.blur?.(); });
      const before = await where();
      await page.keyboard.press(key);
      if ((await where()) !== before) { fail("character-keys", `2.1.4 the key "${key}" alone acts`); await page.keyboard.press(key).catch(() => {}); await page.keyboard.press("Escape"); }
    }
  }
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (probed.has("text-200")) {
    // 1.4.4: text at 200 percent loses nothing sideways.
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    if (await overflow()) fail("text-200", "1.4.4 text at 200 percent overflows sideways");
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  if (probed.has("reflow")) {
    // 1.4.10: at 320 CSS pixels wide, nothing needs scrolling sideways.
    await page.setViewportSize({ width: 320, height: view.viewport.height });
    await page.waitForTimeout(200);
    if (await overflow()) fail("reflow", "1.4.10 at 320 px the page scrolls sideways");
    await page.setViewportSize(view.viewport);
    await page.waitForTimeout(200);
  }
  if (probed.has("text-spacing")) {
    // 1.4.12: WCAG's own spacing (line 1.5, paragraph 2, letter 0.12, word 0.16) clips nothing new.
    const clipped = () => page.evaluate(inPage(`return deep().filter((el) => shown(el) && el.children.length === 0 && el.textContent.trim() && /hidden|clip/.test(getComputedStyle(el).overflow) && getComputedStyle(el).textOverflow !== "ellipsis" && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)).map((el) => el.id || el.className || el.tagName);`));
    const was = new Set(await clipped());
    await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" }).then((h) => h.evaluate((el) => el.setAttribute("data-probe", "spacing")));
    await page.waitForTimeout(100);
    if (await overflow()) fail("text-spacing", "1.4.12 the page overflows sideways");
    for (const c of await clipped()) if (!was.has(c)) fail("text-spacing", `1.4.12 ${c} is clipped`);
    await page.evaluate(() => document.querySelector("style[data-probe=spacing]")?.remove());
  }
  if (probed.has("on-input")) {
    // 3.2.2: typing into a field changes no place.
    const before = await where();
    await page.fill("#pr-prompt", "a");
    if ((await where()) !== before) fail("on-input", "3.2.2 typing in Ask changed the page");
    await page.fill("#pr-prompt", "");
  }
  if (probed.has("pointer-cancellation")) {
    // 2.5.2: a press acts on release, and releasing away from it cancels.
    const before = await where();
    const box = await page.locator(`.pr-go[data-place="${home}"]`).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if ((await where()) !== before) fail("pointer-cancellation", "2.5.2 a press acted before release");
    await page.mouse.move(2, view.viewport.height - 2);
    await page.mouse.up();
    if ((await where()) !== before) fail("pointer-cancellation", "2.5.2 releasing away did not cancel");
  }
  if (probed.has("error-identification")) {
    // 3.3.1, 3.3.3: a wrong address is identified, in text, with what would be right.
    await page.click('.pr-go[data-place="conversations"]');
    await page.click("#pr-new");
    await page.fill('#pr-act input[type="email"]', "mary");
    await page.fill("#pr-act textarea", "a");
    await page.click('#pr-act button[type="submit"]');
    const said = await page.evaluate(() => { const f = document.querySelector('#pr-act input[type="email"]'); return { invalid: f.matches(":invalid") || f.getAttribute("aria-invalid") === "true", message: f.validationMessage }; });
    if (!said.invalid) fail("error-identification", "3.3.1 a wrong address is not identified");
    if (!said.message) fail("error-identification", "3.3.3 a wrong address comes with no suggestion");
    await page.keyboard.press("Escape");
  }
  return out;
}

// AccName 1.2: each control, and each node named by an attribute, has the name the step that names it gives
// from the page's own markup; the name is read as the browser computed it (the accessibility tree).
const NAMED = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "switch", "radio", "slider", "DisclosureTriangle"]);
async function names(page, tries = 5) {
  const cdp = await page.context().newCDPSession(page);
  const out = [];
  // The browser names a node in the letter case its style draws; the step gives the letters.
  const squash = (text) => String(text ?? "").replace(/\s+/g, "").toLowerCase();
  for (const n of (await cdp.send("Accessibility.getFullAXTree")).nodes) {
    const src = (n.name?.sources ?? []).find((s) => !s.superseded && (s.value?.value || s.attributeValue?.value));
    if (n.ignored || !n.backendDOMNodeId || n.role?.value === "RootWebArea" || !(NAMED.has(n.role?.value) || (src && src.type !== "contents"))) continue;
    const how = !src ? "none" : src.type === "contents" ? "contents" : src.nativeSource ? "label" : src.attribute;
    const step = { "aria-labelledby": "2B", "aria-label": "2D", contents: "2F", title: "2I", none: "2" }[how] ?? "2E";
    // A node gone since the tree was read means the page drew again in between: the tree is read again, from the page as it stands now.
    const object = (await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId }).catch(() => null))?.object; if (!object) return cdp.detach().then(() => (assert.ok(tries, "accessible names: the page never stood still while its tree was read"), names(page, tries - 1)));
    const { result, exceptionDetails } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true, arguments: [{ value: how }], functionDeclaration: `function (how) {
      const el = this.nodeType === 1 ? this : this.parentElement;
      const gone = (x) => x.hidden || x.getAttribute("aria-hidden") === "true" || getComputedStyle(x).display === "none";
      const said = (x, top) => x.nodeType === 3 ? x.data : x.nodeType !== 1 || (!top && gone(x)) ? "" : (!top && x.getAttribute("aria-label")) || x.alt || [...x.childNodes].map((c) => said(c)).join(" ");
      const want = how === "aria-labelledby" ? el.getAttribute(how).trim().split(/\\s+/).map((id) => el.getRootNode().getElementById(id)).filter(Boolean).map((x) => said(x, true)).join(" ")
        : how === "contents" ? said(el, true) : how === "label" ? [...(el.labels ?? [])].map((x) => said(x, true)).join(" ") : el.getAttribute(how);
      return { want, id: el.id || el.className || el.tagName };
    }` });
    assert.ok(!exceptionDetails, `${n.role?.value} named by ${how}: ${exceptionDetails?.exception?.description}`);
    const { want, id } = result.value;
    if (!squash(n.name?.value)) out.push(`step ${step}: ${n.role.value} ${id} has no name`);
    else if (how !== "none" && squash(want) !== squash(n.name.value)) out.push(`step ${step}: ${n.role.value} ${id} is named "${n.name.value}", its ${how} gives "${want}"`);
  }
  await cdp.detach();
  return out;
}

test("the front end meets every requirement of its standards, as the registry enforces each", { timeout: 20 * 60000 }, async () => {
  for (const name of PROBED) assert.ok(name in SCREEN || ["keyboard", "character-keys", "text-200", "reflow", "text-spacing", "on-input", "pointer-cancellation", "error-identification", "consistent-navigation", "redundant-entry", "no-motion", "accessible-name", "token-file"].includes(name), `no probe "${name}"`);
  const axe = await engine();
  const dir = mkdtempSync(join(tmpdir(), "standards-"));
  const files = FEED.map(([id, ext]) => { const path = join(dir, `${id}.${ext}`); writeFileSync(path, example(id)); return path; });
  const server = await serve();
  // What fails, by "standard id", with the first place it failed.
  const failed = new Map();
  const failing = (standard, id, why) => { const key = `${standard} ${id}`; if (!failed.has(key)) failed.set(key, why); };
  // A probe that names the requirement it found failing ("2.4.7 ...") fails that one; otherwise every requirement it holds.
  const byProbe = (probe, why) => { const named = /(?:^|: )(\d+\.\d+\.\d+) /.exec(why)?.[1]; for (const c of CHECKS.filter((c) => c.kind === "probe" && c.arg === probe)) if (!named || c.id.endsWith(`-${named}`)) failing(c.standard, c.id, why); };

  // 2.5.4: nothing is worked by moving the device (the page's code never listens for motion).
  if (PROBED.has("no-motion")) {
    const code = readdirSync("site", { recursive: true }).filter((f) => /\.m?js$/.test(f) && !/(^|\/)(vendor|test)\//.test(f));
    for (const f of code) if (/devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent/.test(readFileSync(join("site", f), "utf8"))) byProbe("no-motion", `site/${f} listens for device motion`);
  }

  const browser = await chromium.launch();
  try {
    // Design Tokens: the look's token file, as the page serves it, is valid by the format's own schema (the pinned validator, on a blank page).
    if (PROBED.has("token-file")) {
      const { schema, engine: validator } = STANDARDS.find((s) => s.schema);
      const blank = await browser.newPage();
      await blank.evaluate(await engine(validator));
      const tokens = await (await fetch(new URL("look.tokens.json", server.url))).json();
      const errors = await blank.evaluate(([schema, tokens]) => { const valid = new window.ajv7({ allErrors: true, strict: false, validateFormats: false }).compile(JSON.parse(schema)); return valid(tokens) ? [] : valid.errors; }, [await engine(schema), tokens]);
      for (const e of errors) byProbe("token-file", `look.tokens.json${e.instancePath} ${e.message}`);
      // The schema judges a value by the type its own token states, so every token states one.
      (function own(group, path) { for (const [name, x] of Object.entries(group)) if (!name.startsWith("$")) "$value" in x ? "$type" in x || byProbe("token-file", `look.tokens.json${path}/${name} states no type of its own`) : own(x, `${path}/${name}`); })(tokens, "");
    }
    for (const view of VIEWS) {
      // The page's own CSP refuses injected scripts; the checker is let in for the audit only.
      const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US", bypassCSP: true, viewport: view.viewport, colorScheme: view.colorScheme });
      await context.clock.install({ time: new Date(DAY) });
      const page = await context.newPage();
      const errors = faults(page);
      await open(page, server.url);
      // The canonical frame, fetched live, is part of every screen: the walk starts once it is drawn.
      await page.waitForFunction(() => customElements.get("prism-frame") && !document.querySelector(".frame-fallback"), null, { timeout: 30000 }).catch(() => {});
      const navs = [];
      const audit = async (screen) => {
        await page.waitForTimeout(300);
        if (!(await page.evaluate(() => typeof window.axe === "object"))) await page.evaluate(axe);
        const result = await page.evaluate((rules) => window.axe.run(document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] }), RULES);
        for (const v of result.violations) for (const c of CHECKS.filter((c) => c.kind === "axe-core rules" && c.arg.includes(v.id))) {
          failing(c.standard, c.id, `${v.id} at ${screen} (${view.name}): ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
        }
        for (const selector of ABSENT) {
          const found = await page.evaluate(inPage(`return deep().filter((el) => el.matches(arg)).map((el) => el.outerHTML.slice(0, 80));`), selector);
          for (const c of CHECKS.filter((c) => c.kind === "absent" && c.arg === selector)) if (found.length) failing(c.standard, c.id, `at ${screen} (${view.name}) "${selector}" matches ${found.slice(0, 2).join(", ")}`);
        }
        for (const [name, probe] of Object.entries(SCREEN)) if (PROBED.has(name)) {
          const arg = name === "multiple-ways" ? PLACES.filter((p) => p.viewpoint === "person" && p.host !== "composer").map((p) => p.key) : null;
          for (const why of await page.evaluate(probe, arg)) byProbe(name, `at ${screen} (${view.name}): ${why}`);
        }
        if (PROBED.has("accessible-name")) for (const why of await names(page)) byProbe("accessible-name", `at ${screen} (${view.name}): ${why}`);
        // 2.1.1: the keyboard reaches every control of every screen, not only of the last.
        for (const { probe, why } of await viewProbes(page, view, null, new Set(["keyboard"].filter((name) => PROBED.has(name))))) byProbe(probe, `at ${screen} (${view.name}): ${why}`);
        // 3.2.3, 3.2.4, 3.2.6: the navigation, and the help beside it, are the same on every screen.
        navs.push([screen, await page.evaluate(() => JSON.stringify([...document.querySelectorAll(".pr-go")].map((b) => [b.dataset.place, b.textContent.trim()]).concat([[ "spec", document.getElementById("open-spec")?.textContent.trim() ?? "" ]])))]);
      };
      const go = (key) => page.click(`.pr-go[data-place="${key}"]`);

      await audit("first visit");
      // Content arrives as the person brings it: the device row's file picker in Settings.
      const settings = PLACES.find((p) => p.show === "settings");
      await page.click("#pr-setup .pr-setup-go").catch(() => {});
      await go(settings.key);
      const picker = page.locator('#pr-settings label.pr-file input[type="file"][accept*=".ics"]').first();
      await picker.waitFor({ state: "attached", timeout: 15000 });
      await picker.setInputFiles(files);
      await page.waitForFunction(() => /^\d+ items$/.test(document.getElementById("pr-out").textContent), null, { timeout: 30000 });
      await audit(settings.key);
      const places = PLACES.filter((p) => p.viewpoint === "person" && p.host !== "composer" && p.show !== "settings");
      for (const place of places) {
        await go(place.key);
        await audit(place.key);
        const row = page.locator("#pr-list [aria-expanded=false]").first();
        if (await row.count()) { await row.click(); await audit(`${place.key}, opened`); }
      }
      await go("calendar");
      for (const { probe, why } of await viewProbes(page, view, places[0].key)) byProbe(probe, `${view.name}: ${why}`);
      await page.fill("#pr-prompt", "What is going on with John?");
      await page.click("#pr-ask-go");
      await page.waitForFunction(() => !document.getElementById("pr-ask-go").disabled, null, { timeout: 15000 });
      await audit("answer");
      if (PROBED.has("consistent-navigation")) for (const [screen, nav] of navs) if (nav !== navs[0][1]) byProbe("consistent-navigation", `${view.name}: the navigation at ${screen} differs from the first visit's`);
      if (PROBED.has("redundant-entry")) {
        // 3.3.7: what the person has given once is there the next time it is asked for.
        await go(settings.key);
        const field = page.locator('#pr-settings input[autocomplete="email"]').first();
        await field.fill(toOf("rfc5322-1"));
        await field.locator("xpath=following::button[1]").click();
        await go(places[0].key);
        await go(settings.key);
        if ((await field.inputValue()) !== toOf("rfc5322-1")) byProbe("redundant-entry", `${view.name}: 3.3.7 the address given is asked for again`);
      }
      assert.deepEqual(errors, [], `page errors (${view.name}): ${errors.join(" | ")}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const debt = STANDARDS.flatMap((s) => (DEBTS[s.key] ?? []).filter((id) => s.enforcedBy?.[id]?.suite === SUITE).map((id) => `${s.key} ${id}`));
  const fresh = [...failed].filter(([key]) => !debt.includes(key)).map(([key, why]) => `${key}: ${why}`);
  assert.deepEqual(fresh, [], `${MEASURE}: these requirements fail: fix them, or list each under the standard's debt with why`);
  const gone = debt.filter((key) => !failed.has(key));
  assert.deepEqual(gone, [], "these now hold: take them off the debt so they stay held");
});
