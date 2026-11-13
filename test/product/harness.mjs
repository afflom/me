// The product walks' shared pieces: the page served (assembled site or the
// published URL), the product record, and the system view's words, each taken
// from the model rather than written here. Development measures stay in this
// directory and in the job summary; nothing here reaches the page.
import { appendFileSync, createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

export const { chromium } = createRequire(import.meta.url)("playwright");
export const product = JSON.parse(readFileSync("app/specs/product/spec.json", "utf8"));
export const surface = JSON.parse(readFileSync("app/specs/surface/spec.json", "utf8"));
const site = resolve(process.env.PAGE_SITE ?? "site");
const published = process.env.PAGE_URL;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// Serves the assembled site under /me/, or names the published page.
export async function serve() {
  if (published) return { url: published, close() {} };
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/me\//, "/");
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(site, path));
    if (!file.startsWith(site) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${server.address().port}/me/`, close: () => server.close() };
}

export async function open(page, url) {
  await page.goto(url);
  await page.waitForSelector("html.pr-ready", { timeout: 60000 });
}

// Every word the system view would put on the screen, from the surface entries
// the product record assigns to it and the record's own machinery terms.
export function systemWords() {
  // An entry's own viewpoint in the surface model wins; the record places the rest.
  const own = (kind) => Object.fromEntries(surface[kind].filter((x) => x?.viewpoint).map((x) => [x.key, x.viewpoint]));
  const view = { ...product.surface };
  for (const kind of ["places", "acts", "groups", "settings", "feeders"]) view[kind] = { ...product.surface[kind], ...own(kind) };
  const words = new Map();
  const add = (text, from) => { if (text) words.set(text, from); };
  const word = (key) => surface.words[key] ?? "";
  for (const p of surface.places) if (view.places[p.key] === "system") add(p.name, `place ${p.key}`);
  for (const a of surface.acts) if (view.acts[a.key] === "system") add(a.word, `act ${a.key}`);
  for (const g of surface.groups) if (view.groups[g.key] === "system") add(g.name, `group ${g.key}`);
  for (const s of surface.settings) if (view.settings[s.key] === "system") add(s.name, `setting ${s.key}`);
  for (const f of surface.feeders) if (view.feeders[f.key] === "system") add(word(f.word), `feeder ${f.key}`);
  for (const [key, text] of Object.entries(surface.words)) if (view.words[key] === "system") add(text, `word ${key}`);
  for (const [lexicon, side] of Object.entries(view.lexicons)) if (side === "system") for (const text of surface[lexicon]) add(text, `${lexicon} ${text}`);
  for (const term of product.machinery.terms) add(term, "machinery");
  return words;
}

// What the person can see of the Prism itself: text and the names of
// controls, outside the locked frame and the template's own header.
export async function visible(page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll("#stage, #rail")];
    const seen = [];
    const shown = (element) => {
      for (let e = element; e && e !== document.body; e = e.parentElement) {
        const style = getComputedStyle(e);
        if (e.hidden || style.display === "none" || style.visibility === "hidden") return false;
      }
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (text && shown(node.parentElement)) seen.push(text);
      }
      for (const element of root.querySelectorAll("[placeholder], [aria-label], [title], input[type=button], input[type=submit]")) {
        if (!shown(element)) continue;
        for (const name of ["placeholder", "aria-label", "title", "value"]) {
          const text = element.getAttribute(name)?.trim();
          if (text && (name !== "value" || element.type === "button" || element.type === "submit")) seen.push(text);
        }
      }
    }
    return seen;
  });
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function leaks(seen, words) {
  const found = new Set();
  for (const [term] of words) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "u");
    if (seen.some((text) => pattern.test(text))) found.add(term);
  }
  return found;
}

// PD-02's ratchet: system words shown that the debt does not list, and listed
// words that no longer show.
export function ratchet(shown, debt) {
  const listed = new Set(debt);
  return { fresh: [...shown].filter((term) => !listed.has(term)).sort(), gone: [...listed].filter((term) => !shown.has(term)).sort() };
}

// PD-01's verdict: journeys recorded as working that fail, and journeys that
// pass while still recorded as not yet.
export function verdict(rows) {
  return {
    broken: rows.filter((r) => r.journey.status === "works" && !(r.fresh.ok && r.back.ok)),
    unrecorded: rows.filter((r) => r.journey.status !== "works" && r.fresh.ok),
  };
}

export function summary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${lines.join("\n")}\n\n`);
  console.log(lines.join("\n"));
}
