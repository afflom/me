// R4-01 acceptance in headless Chromium.
//   node bootstrap/r4-objects.mjs site [--from DIR]   (writes site/r4/objects/)
//   node test/r4/run.mjs
//
// Two local origins: the page (the repository root, as Pages serves site/) and
// a mirror serving the same pieces. Under /bad/ the mirror flips one byte in
// each weights piece (planted defect).
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
const objects = path.join(root, "site/r4/objects");
const lock = JSON.parse(fs.readFileSync(path.join(root, "site/r4/r4.lock.json"), "utf8"));
const weightPieces = new Set(lock.models.inprism.flatMap((m) => m.pieces.map((p) => `${p.fingerprint.slice(7)}.gz`)));

// 0. The model's own examples through the spec decider (no browser).
const spec = JSON.parse(fs.readFileSync(path.join(root, "app/specs/r4/spec.json"), "utf8"));
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
    raw[Math.min(4096, raw.length - 1)] ^= 0x01;
    body = gzipSync(raw);
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
  res.end(body);
}
const page = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/test/r4/") return send(res, path.join(here, "index.html"));
  send(res, path.join(root, path.normalize(url.pathname)));
});
const mirror = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const name = path.basename(url.pathname);
  send(res, path.join(objects, name), url.pathname.startsWith("/bad/") && weightPieces.has(name));
});
await new Promise((r) => page.listen(0, "127.0.0.1", r));
await new Promise((r) => mirror.listen(0, "127.0.0.1", r));
const P = page.address().port;
const M = mirror.address().port;

// PLAYWRIGHT_CHROMIUM names a browser binary when the installed one is another build.
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const tab = await browser.newPage();
tab.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text()); });
tab.on("pageerror", (e) => console.log("[pageerror]", e.message));
// The bad source is another origin (localhost, not 127.0.0.1) so a grant can name it alone.
const q = new URLSearchParams({ mirror: `http://127.0.0.1:${M}/good/`, bad: `http://localhost:${M}/bad/` });
await tab.goto(`http://127.0.0.1:${P}/test/r4/?${q}`);
await tab.waitForFunction(() => window.__r4, null, { timeout: 600000 });
const results = await tab.evaluate(() => window.__r4);
await browser.close(); page.close(); mirror.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.pass || process.env.R4_VERBOSE) console.log("      " + JSON.stringify(r.detail).slice(0, 1500));
}
console.log(`${results.length - failed}/${results.length} scenarios pass (R4-01)`);
process.exit(failed ? 1 : 0);
