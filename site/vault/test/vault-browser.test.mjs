// The vault scenario in headless Chromium: once with objects in OPFS, once with OPFS
// unable to write so objects fall back to IndexedDB. The key ring is a pair of
// non-extractable CryptoKeys in the browser's own IndexedDB.
// usage: node --test site/vault/test/vault-browser.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { checks } from "./scenario.mjs";

const site = fileURLToPath(new URL("../../", import.meta.url));
const types = { ".mjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html" };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.setHeader("content-type", "text/html");
    return response.end('<!doctype html><meta charset="utf-8"><title>vault</title>');
  }
  try {
    const path = resolve(site, "." + pathname);
    assert.ok(path.startsWith(site));
    response.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
test.after(async () => { await browser.close(); server.close(); });

async function run(where, init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { scenario } = await import("/vault/test/scenario.mjs");
    const read = async (file) => new Uint8Array(await (await fetch(`/vault/test/guests/${file}`)).arrayBuffer());
    return scenario(read);
  });
  await context.close();
  assert.deepEqual(errors, []);
  assert.equal(result.where, where);
  for (const [id, name, ok] of checks(result)) assert.ok(ok, `${id} ${name} (${where})`);
}

test("the vault keeps and restores in OPFS", () => run("opfs"));

test("the vault keeps and restores in IndexedDB where OPFS cannot write", () =>
  run("idb", () => { try { delete FileSystemFileHandle.prototype.createWritable; } catch {} }));
