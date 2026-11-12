#!/usr/bin/env node
// Serves R4's pinned objects from the page (R4-01).
//
// The R4 engine (51.7 MB) and its weights (40.1 MB) are each larger than the
// 16 MiB a single served object may be. site/r4/r4.lock.json names every object
// by SHA-256 and splits it into pieces of `pieceBytes`, each named by its own
// SHA-256. This script fetches each object from its pinned upstream commit,
// refuses it unless it re-derives to the locked fingerprint and size, cuts it
// into the locked pieces, refuses any piece that differs, and writes each piece
// gzip-compressed as site/r4/objects/<piece sha256>.gz. The browser checks every
// piece after decompressing it and the whole object after joining the pieces,
// so the compression and the server are never trusted.
//
//   node bootstrap/r4-objects.mjs site                 fetch, check, write pieces
//   node bootstrap/r4-objects.mjs site --from DIR      read DIR/<path> instead of fetching
//   node bootstrap/r4-objects.mjs site --from DIR --write-lock
//                                                      record the pieces in the lock (maintainers)
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const site = args[0] ?? "site";
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const writeLock = args.includes("--write-lock");
const lockPath = join(site, "r4", "r4.lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));

const sha = (bytes) => "sha256-" + createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  console.error(`r4-objects: ${message} (R4-01)`);
  process.exit(1);
};

if (!Number.isInteger(lock.pieceBytes) || lock.pieceBytes <= 0 || lock.pieceBytes > lock.limitBytes) {
  fail(`pieceBytes ${lock.pieceBytes} is not within the ${lock.limitBytes}-byte limit`);
}

async function source(entry) {
  if (from) return readFile(join(from, entry.path));
  const url = lock.engine.source.origin + entry.path;
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) fail(`${entry.path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const objects = [lock.engine.glue, lock.engine.wasm, ...lock.models.inprism];
const out = join(site, "r4", "objects");
await mkdir(out, { recursive: true });
let served = 0;
for (const entry of objects) {
  const bytes = await source(entry);
  if (bytes.length !== entry.bytes || sha(bytes) !== entry.fingerprint) {
    fail(`${entry.path} is ${bytes.length} bytes ${sha(bytes)}, the lock says ${entry.bytes} bytes ${entry.fingerprint}`);
  }
  const pieces = [];
  for (let at = 0; at < bytes.length; at += lock.pieceBytes) {
    const piece = bytes.subarray(at, Math.min(at + lock.pieceBytes, bytes.length));
    pieces.push({ fingerprint: sha(piece), bytes: piece.length, piece });
  }
  if (writeLock) {
    entry.pieces = pieces.map(({ fingerprint, bytes: n }) => ({ fingerprint, bytes: n }));
  } else if (JSON.stringify(pieces.map(({ fingerprint, bytes: n }) => ({ fingerprint, bytes: n }))) !== JSON.stringify(entry.pieces)) {
    fail(`${entry.path} does not cut into the locked pieces`);
  }
  for (const { fingerprint, piece } of pieces) {
    const gz = gzipSync(piece, { level: 9 });
    if (gz.length > lock.limitBytes) fail(`a piece of ${entry.path} compresses to ${gz.length} bytes`);
    await writeFile(join(out, `${fingerprint.slice(7)}.gz`), gz);
    served += gz.length;
  }
}
if (writeLock) await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log(`r4-objects: ${objects.length} objects, ${objects.reduce((n, e) => n + e.pieces.length, 0)} pieces, ${served} bytes served (R4-01)`);
