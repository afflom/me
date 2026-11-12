#!/usr/bin/env node
// Serves the routed models' pinned objects from the page (MD-01).
//
// site/models/models.lock.json names every byte a routed model runs or loads:
// the runtime for each format (an npm package, pinned by version and its
// registry integrity) and each model's files (a Hugging Face repository,
// pinned by commit). Every file is named by SHA-256 and cut into pieces of
// `pieceBytes`, each named by its own SHA-256, because one object the page
// serves may be at most 16 MiB. This script fetches each file from its pinned
// source, refuses it unless it re-derives to the locked fingerprint and size,
// cuts it into the locked pieces, refuses any piece that differs, and writes
// each piece gzip-compressed as site/models/objects/<piece sha256>.gz. The
// browser checks every piece after decompressing it and the whole file after
// joining them, so neither the hub, the registry, the server nor the
// compression is trusted.
//
//   node bootstrap/model-objects.mjs site                 fetch, check, write pieces
//   node bootstrap/model-objects.mjs site --from DIR      read DIR/<sha256> instead of fetching
//   node bootstrap/model-objects.mjs site --write-lock    record fingerprints and pieces (maintainers)
//   node bootstrap/model-objects.mjs site --keep DIR      also keep each whole file as DIR/<sha256>
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const site = args[0] ?? "site";
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const from = option("--from");
const keep = option("--keep");
const writeLock = args.includes("--write-lock");
const lockPath = join(site, "models", "models.lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));

const sha = (bytes) => "sha256-" + createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  console.error(`model-objects: ${message} (MD-01)`);
  process.exit(1);
};

if (!Number.isInteger(lock.pieceBytes) || lock.pieceBytes <= 0 || lock.pieceBytes > lock.limitBytes) {
  fail(`pieceBytes ${lock.pieceBytes} is not within the ${lock.limitBytes}-byte limit`);
}

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

// One member of an npm tarball (ustar), after the tarball matches its integrity.
const tarballs = new Map();
async function npmMember(pkg, file) {
  const key = `${pkg.name}@${pkg.version}`;
  if (!tarballs.has(key)) {
    const base = pkg.name.split("/").pop();
    const tgz = await download(`${lock.sources.npm}${pkg.name}/-/${base}-${pkg.version}.tgz`);
    const [algorithm, digest] = pkg.integrity.split("-");
    if (createHash(algorithm).update(tgz).digest("base64") !== digest) fail(`${key} does not match its integrity`);
    tarballs.set(key, gunzipSync(tgz));
  }
  const tar = tarballs.get(key);
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const field = (o, n) => header.subarray(o, o + n).toString("utf8").replace(/\0.*$/s, "");
    const name = (field(345, 155) ? field(345, 155) + "/" : "") + field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    if (name === file) return Buffer.from(tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  fail(`${key} has no ${file}`);
}

async function source(owner, entry) {
  if (from && entry.fingerprint) return readFile(join(from, entry.fingerprint.slice(7)));
  if (owner.package) return npmMember(owner.package, entry.path);
  const { hub, repository, revision } = owner.source;
  if (hub !== "huggingface" || !/^[0-9a-f]{40}$/.test(revision)) fail(`${owner.id} is not pinned to a Hugging Face commit`);
  return download(`${lock.sources.huggingface}${repository}/resolve/${revision}/${entry.path}`);
}

const owners = [...lock.runtimes, ...lock.models];
const out = join(site, "models", "objects");
await mkdir(out, { recursive: true });
if (keep) await mkdir(keep, { recursive: true });
let served = 0;
let files = 0;
let count = 0;
for (const owner of owners) {
  for (const entry of owner.files) {
    const bytes = await source(owner, entry);
    if (writeLock) {
      entry.fingerprint = sha(bytes);
      entry.bytes = bytes.length;
    } else if (bytes.length !== entry.bytes || sha(bytes) !== entry.fingerprint) {
      fail(`${owner.id} ${entry.path} is ${bytes.length} bytes ${sha(bytes)}, the lock says ${entry.bytes} bytes ${entry.fingerprint}`);
    }
    if (keep) await writeFile(join(keep, entry.fingerprint.slice(7)), bytes);
    const pieces = [];
    for (let at = 0; at < bytes.length; at += lock.pieceBytes) {
      const piece = bytes.subarray(at, Math.min(at + lock.pieceBytes, bytes.length));
      pieces.push({ fingerprint: sha(piece), bytes: piece.length, piece });
    }
    const listed = pieces.map(({ fingerprint, bytes: n }) => ({ fingerprint, bytes: n }));
    if (writeLock) entry.pieces = listed;
    else if (JSON.stringify(listed) !== JSON.stringify(entry.pieces)) fail(`${owner.id} ${entry.path} does not cut into the locked pieces`);
    for (const { fingerprint, piece } of pieces) {
      const gz = gzipSync(piece, { level: 9 });
      if (gz.length > lock.limitBytes) fail(`a piece of ${entry.path} compresses to ${gz.length} bytes`);
      await writeFile(join(out, `${fingerprint.slice(7)}.gz`), gz);
      served += gz.length;
      count += 1;
    }
    files += 1;
  }
}
if (writeLock) await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log(`model-objects: ${owners.length} runtimes and models, ${files} files, ${count} pieces, ${served} bytes served (MD-01)`);
