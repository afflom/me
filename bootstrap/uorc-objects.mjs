#!/usr/bin/env node
// Serves the pinned uorc WebAssembly client from the page (UO-02).
//
// site/uorc/uorc.lock.json pins one release asset of UOR-Foundation/compression
// by SHA-256, and each member the page serves by its own SHA-256 and size. This
// script fetches the tarball, refuses it unless it re-derives to the locked
// fingerprint, extracts each member (ustar), refuses any member that differs
// from the lock or exceeds the per-object limit, and writes it under
// site/uorc/. The browser checks the client's bytes again before it compiles
// them, so neither the release host nor the page's server is trusted.
//
//   node bootstrap/uorc-objects.mjs site              fetch, check, write
//   node bootstrap/uorc-objects.mjs site --from FILE  read the tarball from FILE instead
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const site = args[0] ?? "site";
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const lock = JSON.parse(await readFile(join(site, "uorc", "uorc.lock.json"), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  console.error(`uorc-objects: ${message} (UO-02)`);
  process.exit(1);
};

async function download(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 4) fail(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const tgz = from ? await readFile(from) : await download(lock.source);
if (sha(tgz) !== lock.tarball.sha256) fail(`the release asset is ${sha(tgz)}, the lock says ${lock.tarball.sha256}`);
const tar = gunzipSync(tgz);
const members = new Map();
for (let at = 0; at + 512 <= tar.length; ) {
  const header = tar.subarray(at, at + 512);
  if (header.every((b) => b === 0)) break;
  const field = (o, n) => header.subarray(o, o + n).toString("utf8").replace(/\0.*$/s, "");
  const name = (field(345, 155) ? field(345, 155) + "/" : "") + field(0, 100);
  const size = parseInt(field(124, 12).trim() || "0", 8);
  members.set(name, Buffer.from(tar.subarray(at + 512, at + 512 + size)));
  at += 512 + Math.ceil(size / 512) * 512;
}
let served = 0;
for (const file of lock.files) {
  const bytes = members.get(file.member);
  if (!bytes) fail(`the release has no ${file.member}`);
  if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail(`${file.member} is ${bytes.length} bytes ${sha(bytes)}, the lock says ${file.bytes} bytes ${file.sha256}`);
  if (bytes.length > lock.limitBytes) fail(`${file.member} is larger than one served object may be`);
  const out = join(site, "uorc", file.path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, bytes);
  served += bytes.length;
}
console.log(`uorc-objects: ${lock.release}, ${lock.files.length} files, ${served} bytes served (UO-02)`);
