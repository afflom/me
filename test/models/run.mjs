// MD-01 acceptance in headless Chromium.
//   node bootstrap/model-objects.mjs site [--from DIR]   (writes site/models/objects/)
//   node bootstrap/r4-objects.mjs site [--from DIR]      (writes site/r4/objects/; R4 routes)
//   node test/models/run.mjs
//
// The page origin serves the repository root as Pages serves site/. Under
// /bad/ it serves the same model pieces with one byte flipped in each
// (planted defect).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { specDecider } from "../../site/r4/decide.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const objects = path.join(root, "site/models/objects");

// 0. The model's own examples through the spec decider (no browser).
const spec = JSON.parse(fs.readFileSync(path.join(root, "app/specs/models/spec.json"), "utf8"));
const decide = specDecider(spec);
const bad = spec.examples.filter((e) => decide(e.request).outcome !== e.response);
console.log(`spec examples: ${spec.examples.length - bad.length}/${spec.examples.length} pass`);
if (bad.length) { console.log(bad); process.exit(1); }

const types = { ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
function send(res, file, flip = false) {
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (flip) {
    const raw = Buffer.from(gunzipSync(body));
    raw[Math.floor(raw.length / 2)] ^= 0x01;
    body = gzipSync(raw);
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  res.end(body);
}
let pieceRequests = 0;
const page = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/test/models/") return send(res, path.join(here, "index.html"));
  if (url.pathname.startsWith("/bad/")) return send(res, path.join(objects, path.basename(url.pathname)), true);
  if (url.pathname.startsWith("/site/models/objects/")) pieceRequests += 1;
  send(res, path.join(root, path.normalize(url.pathname)));
});
await new Promise((r) => page.listen(0, "127.0.0.1", r));
const P = page.address().port;

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const tab = await browser.newPage();
tab.on("console", (m) => { if (m.type() === "error" || process.env.MODELS_VERBOSE) console.log("[page]", m.text()); });
tab.on("pageerror", (e) => console.log("[pageerror]", e.message));
tab.on("worker", (w) => w.on("console", (m) => { if (process.env.MODELS_VERBOSE) console.log("[worker]", m.text()); }));
tab.on("crash", () => console.log("[crash] the page crashed"));
await tab.goto(`http://127.0.0.1:${P}/test/models/?bad=${encodeURIComponent(`http://127.0.0.1:${P}/bad/`)}`);
await tab.waitForFunction(() => window.__models, null, { timeout: 1200000, polling: 1000 });
const results = await tab.evaluate(() => window.__models);
await browser.close();
page.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.pass || process.env.MODELS_VERBOSE) console.log("      " + JSON.stringify(r.detail).slice(0, 1500));
}
console.log(`${results.length - failed}/${results.length} scenarios pass, ${pieceRequests} pieces served (MD-01)`);
process.exit(failed ? 1 : 0);
