#!/usr/bin/env node
/**
 * prism-prompt: one prompt to a whole Prism application.
 *
 *   node builder/cli.mjs build <prompt.json> --out <dir> [--last-modified <instant>]
 *       Write every file of the application into <dir>, laid out as a
 *       repository created from UOR-Foundation/template, and delete the
 *       template's example app there if it is present.
 *   node builder/cli.mjs build-set <set.json> --out <dir> [--check] [--last-modified <instant>]
 *       Write one application from a prompt set (prism/prompt-set/1): every
 *       app's model and proofs, a router module whose guest answers each app's
 *       requests by name, and one set of facet modules for them all. Rows,
 *       entrypoints and files the set does not own are kept. With --check,
 *       write nothing and exit 1 if any file the set owns differs from <dir>.
 *   node builder/cli.mjs check <prompt.json>
 *       Check the prompt and print what the app will claim, writing nothing.
 *   node builder/cli.mjs schema
 *       Print the MCP tool `prism_prompt`, whose input is one prompt.
 *   node builder/cli.mjs axioms <prompt.json> <verify.log>
 *       Record in the prompt the exact axiom set each declaration was observed
 *       to use, from the LLV7005 diagnostics of a verify (as prism-code does).
 *   node builder/cli.mjs list
 *       Print the gallery's example names as a JSON array, the matrix the
 *       pages workflow builds and verifies one job per example from.
 *
 * Exit codes: 0 done, 2 the prompt was refused (the reason is printed), 64 usage.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp, claimLines } from './build.mjs';
import { buildSet } from './set.mjs';
import { TOOL } from './tool.mjs';
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

const [verb, file, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i < 0 ? undefined : rest[i + 1];
};
/** When the prompt was last committed, so a rebuild writes the same bytes; now, for a prompt Git does not know. */
const committed = (path) => {
  let iso = '';
  try {
    iso = execFileSync('git', ['log', '-1', '--format=%ct', '--', basename(path)], { cwd: dirname(resolve(path)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  const seconds = /^\d+$/.test(iso) ? Number(iso) : Math.floor(Date.now() / 1000);
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
};
/** The gallery's examples, by the name of each prompt file. */
function exampleNames() {
  const examples = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
  return JSON.parse(readFileSync(join(examples, 'gallery.json'), 'utf8')).examples.map((e) => e.prompt.replace(/\.prompt\.json$/, ''));
}
/**
 * \`PrismX.X.name\` violates its exact axiom policy: observed [A, B] gives
 * { name, axioms }, as prism-code's journey/sdk.mjs reads the same diagnostic.
 */
function axiomViolations(log) {
  return [...log.matchAll(/LLV7005[^\n]*?`([^`]+)` violates its exact axiom policy: observed \[([^\]]*)\]/g)].map((m) => ({
    name: m[1].split('.').pop(),
    axioms: m[2].split(',').map((a) => a.trim()).filter(Boolean).sort(),
  }));
}
const usage = () => {
  console.error('usage: cli.mjs build <prompt.json> --out <dir> | build-set <set.json> --out <dir> [--check] | check <prompt.json> | axioms <prompt.json> <verify.log> | schema | list');
  process.exit(64);
};

try {
  if (verb === 'schema') {
    console.log(JSON.stringify(TOOL, null, 2));
  } else if (verb === 'axioms') {
    const log = rest[0];
    if (!file || !log) usage();
    const prompt = JSON.parse(readFileSync(file, 'utf8'));
    const observed = axiomViolations(readFileSync(log, 'utf8'));
    if (observed.length === 0) {
      console.log('the log reports no axiom policy violation; the prompt is unchanged');
    } else {
      prompt.axioms = { ...(prompt.axioms ?? {}) };
      for (const { name, axioms } of observed) prompt.axioms[name] = axioms;
      await buildApp(prompt, { lastModified: committed(file) });
      writeFileSync(file, `${JSON.stringify(prompt, null, 2)}\n`);
      for (const { name, axioms } of observed) console.log(`${name}: [${axioms.join(', ')}]`);
    }
  } else if (verb === 'build-set') {
    const out = flag('--out');
    if (!file || !out) usage();
    const set = JSON.parse(readFileSync(file, 'utf8'));
    const prompts = (set.prompts ?? []).map((p) => JSON.parse(readFileSync(join(dirname(file), p), 'utf8')));
    const current = (path) => {
      try {
        return readFileSync(join(out, path), 'utf8');
      } catch {
        return undefined;
      }
    };
    // The newest commit of the set or any of its prompts dates the threat model.
    const lastModified = flag('--last-modified') ?? [file, ...set.prompts.map((p) => join(dirname(file), p))].map(committed).sort().pop();
    const built = await buildSet(set, prompts, { lastModified, current });
    if (rest.includes('--check')) {
      const stale = [...Object.entries(built.files).filter(([path, text]) => current(path) !== text).map(([path]) => path), ...built.remove.filter((path) => current(path) !== undefined)];
      for (const path of stale) console.error(`stale: ${path}`);
      if (stale.length) process.exit(1);
      console.log(`${built.set.title}: ${built.models.length} apps, ${Object.keys(built.files).length} files, ${built.router.vectors.length} acceptance vectors, all current`);
    } else {
      for (const path of built.remove) rmSync(join(out, path), { force: true });
      for (const [path, text] of Object.entries(built.files)) {
        mkdirSync(dirname(join(out, path)), { recursive: true });
        writeFileSync(join(out, path), text);
      }
      console.log(`wrote ${Object.keys(built.files).length} files for ${built.set.title} (${built.models.length} apps, ${built.router.vectors.length} acceptance vectors) into ${out}`);
      for (const line of claimLines(built.claims)) console.log(line);
    }
  } else if (verb === 'list') {
    console.log(JSON.stringify(exampleNames()));
  } else if (verb === 'build' || verb === 'check') {
    if (!file) usage();
    const prompt = JSON.parse(readFileSync(file, 'utf8'));
    const built = await buildApp(prompt, { lastModified: flag('--last-modified') ?? committed(file) });
    if (verb === 'check') {
      console.log(`${built.model.title}: ${built.model.pattern.name} (${built.model.pattern.standard}), ${Object.keys(built.files).length} files, ${built.model.vectors.length} acceptance vectors`);
      const mc = built.model.machine;
      if (mc) console.log(`machine: ${mc.states.length} states from ${mc.initial}; reachable ${mc.reachable.join(', ')}${mc.final.length ? `; final ${mc.final.join(', ')}` : ''}; derived ${mc.derived.join(', ') || 'none'}${mc.exhaustive ? '' : ` (sample of ${mc.sampled} requests is not every request, so no state is claimed unreachable)`}`);
      for (const line of claimLines(built.claims)) console.log(line);
    } else {
      const out = flag('--out');
      if (!out) usage();
      for (const path of built.remove) rmSync(join(out, path), { force: true });
      for (const [path, text] of Object.entries(built.files)) {
        mkdirSync(dirname(join(out, path)), { recursive: true });
        writeFileSync(join(out, path), text);
      }
      console.log(`wrote ${Object.keys(built.files).length} files for ${built.model.title} into ${out}`);
    }
  } else usage();
} catch (error) {
  if (error instanceof SpecError || error instanceof SyntaxError) {
    console.error(`refused: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
