/**
 * `prism-code mcp`: the Prism MCP server, over stdio, with no dependencies.
 *
 * It owns the whole journey: the greeting, the spec session, the model,
 * the proof and the build. An agent only renders what it returns. Proving
 * and building take minutes, longer than some agents wait for one tool call,
 * so both run as jobs: a call waits up to `wait` seconds, and a later call
 * of the same tool picks the job up where it is.
 */
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { SpecError, validateSpec } from './spec.mjs';
import { answersFromSpec, nextTurn, STEPS } from './session.mjs';
import { appDir, modelPath, readSession, writeSession, writeSpecDocument } from './project.mjs';
import { build, prove, tryRequest } from './engine.mjs';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `Prism builds formally verified apps. For Prism or /prism, call prism_start.
From the user's one-line request, draft the whole spec, with a reason for every rule and property, and pass it to prism_spec. Ask only what you cannot infer. When a result has an issue, fix the draft, or ask the user if only they know.
Show the checked draft once for approval, properties first: Lean proves them, so the user must agree they are right. If you can draw HTML in the chat, draw one editable card (an App name field, a text box per part, approve button), never a multiple-choice question.
On approval, answer the review yes, then call prism_build.
Never edit files under prism/ by hand.
prism_prove and prism_build take minutes: while they return "running", say what is happening and call again.
Say "proved" only for what Lean proved, and "tested" for what acceptance vectors cover.`;

const GREETING = 'Prism turns one sentence into an app whose rules are proved by Lean, not just tested. I will draft the spec for your approval, then prove and build it.';

const CONDITIONS = {
  type: 'array',
  minItems: 1,
  description: 'All must hold. A choice field compares with is or is not and one of its choices; a number field compares with a whole number or another number field, as {"field": "income"}.',
  items: {
    type: 'object',
    properties: {
      field: { type: 'string' },
      op: { type: 'string', enum: ['is', 'is not', '<', '<=', '>', '>=', '=', '!='] },
      value: { anyOf: [{ type: 'string' }, { type: 'integer', minimum: 0 }, { type: 'object', properties: { field: { type: 'string' } }, required: ['field'] }] },
    },
    required: ['field', 'op', 'value'],
  },
};

const WHY = { type: 'string', description: 'Why, in a few words, such as "it enforces INV-001".' };

/** The prism/spec/1 shape, so an agent can draft a whole spec from one sentence. */
const SPEC_INPUT = {
  type: 'object',
  description: 'A whole prism/spec/1 spec. Omit to read.',
  properties: {
    name: { type: 'string', description: 'Lower case and hyphens, such as loan-approval.' },
    title: { type: 'string' },
    purpose: { type: 'string', description: 'What the app decides, in one sentence.' },
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      description: 'One request is these values in order, separated by spaces.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A lower-case word.' },
          kind: { type: 'string', enum: ['number', 'choice'] },
          values: { type: 'array', items: { type: 'string' }, description: 'For a choice: two to 32 lower-case words.' },
          min: { type: 'integer', minimum: 0 },
          max: { type: 'integer', minimum: 0 },
          means: { type: 'string', description: 'What the field is, with its unit, such as "yearly income, in whole dollars".' },
        },
        required: ['name', 'kind'],
      },
    },
    outcomes: { type: 'array', minItems: 2, items: { type: 'string' }, description: 'Lower-case words; invalid is reserved.' },
    meanings: { type: 'object', additionalProperties: { type: 'string' }, description: 'What each answer means, such as {"review": "a person must decide"}.' },
    rules: { type: 'array', minItems: 1, maxItems: 24, description: 'In order; the first that matches decides.', items: { type: 'object', properties: { when: CONDITIONS, then: { type: 'string' }, why: WHY }, required: ['when', 'then'] } },
    otherwise: { type: 'string', description: 'The answer when no rule matches.' },
    otherwiseWhy: WHY,
    properties: { type: 'array', description: 'What must never or always happen; each becomes a theorem Lean proves.', items: { type: 'object', properties: { kind: { type: 'string', enum: ['never', 'always'] }, when: CONDITIONS, then: { type: 'string' }, why: { type: 'string', description: 'The harm it prevents, such as "poor credit history predicts default". Ask the user when you cannot tell.' } }, required: ['kind', 'when', 'then'] } },
    limits: { type: 'array', items: { type: 'string' }, description: 'What the app does not decide, and choices the rules make silently, such as "fair credit is treated as good".' },
    examples: { type: 'array', description: 'Requests and their expected answers; each becomes an acceptance vector.', items: { type: 'object', properties: { request: { type: 'string' }, response: { type: 'string' } }, required: ['request', 'response'] } },
  },
  required: ['purpose', 'fields', 'outcomes', 'rules', 'otherwise'],
};

const TOOLS = [
  {
    name: 'prism_start',
    description: 'Start or resume the Prism session in this project. Returns a short greeting, and the next question for when you cannot draft the whole spec with prism_spec. Call it first, and whenever you lose track.',
    inputSchema: { type: 'object', properties: { restart: { type: 'boolean', description: 'Discard the answers so far and start over.' } }, additionalProperties: false },
  },
  {
    name: 'prism_answer',
    description: 'Record the user\'s answer to the current question and get the next one. Pass step to change an earlier answer (purpose, fields, outcomes, rules, properties, examples, review). When the result has an issue, ask the user about it and answer the same step again.',
    inputSchema: {
      type: 'object',
      properties: { answer: { type: 'string', description: 'The answer, in the format the question shows.' }, step: { type: 'string', enum: STEPS, description: 'The step this answers; default the current one.' } },
      required: ['answer'],
      additionalProperties: false,
    },
  },
  {
    name: 'prism_spec',
    description: 'Read the whole spec as prism/spec/1 JSON, or replace it in one call with a spec you drafted from the user\'s request. A replaced spec is checked exactly as answers are: each example against the rules, each property for a counterexample. The result is the review step, with a summary to show the user for approval.',
    inputSchema: { type: 'object', properties: { spec: SPEC_INPUT }, additionalProperties: false },
  },
  {
    name: 'prism_prove',
    description: 'Write the LexLean model and ask Lean to prove every property: in the SDK image when it is on this machine, else on the hosted verifier at https://mcp.uor.foundation/, which receives the files under prism/src/ and stores them unlisted (not searchable, but readable by anyone with its draft ID). Takes one to five minutes. Returns state running while it works; call again to keep waiting.',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' }, overwrite: { type: 'boolean', description: 'Replace a model that was edited by hand.' } }, additionalProperties: false },
  },
  {
    name: 'prism_build',
    description: 'Prove, then build the app into a holo and replay its acceptance vectors through the built guest. Where it builds is chosen for the user: in the SDK image when it is on this machine, else on GitHub Actions when the user is signed in to GitHub (no Docker here; this machine verifies what comes back), else in the SDK image after downloading it (about 5.5 GB). A GitHub build of an app with no repository returns needs "repository" and a suggested name: ask the user to approve creating that public repository, then call again with repository set. Prism creates it from UOR-Foundation/template, so the app gets the template\'s frame, page and gate; writes the app, its claims, tests and page into it; pushes; and once the gate and the page pass, returns the live GitHub Pages URL, after checking the live holo here. A GitHub build takes ten to fifteen minutes. Returns state running while it works; call again to keep waiting.',
    inputSchema: {
      type: 'object',
      properties: {
        wait: { type: 'number', description: 'Seconds to wait before returning, default 45.' },
        overwrite: { type: 'boolean', description: 'Replace a model that was edited by hand.' },
        remote: { type: 'string', enum: ['github', 'local'], description: 'Where to build, when the user asks for one: github (the repository\'s Actions) or local (the SDK image). Omit to let Prism choose.' },
        repository: { type: 'string', description: 'owner/name of the GitHub repository to create for the app, only after the user approved it.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'prism_try',
    description: 'Answer one request, from the built app when there is one, else from the spec, and say which rule decided it.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'One request line, the fields separated by single spaces.' } }, required: ['request'], additionalProperties: false },
  },
  {
    name: 'prism_status',
    description: 'Where the session is: the next question, what is proved, what is built, and any job in progress.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const PROMPTS = [{ name: 'prism', description: 'Build a formally verified app with Prism', arguments: [] }];

/** A server bound to a working directory. `send` writes one JSON-RPC message. */
/** Whether a process still runs. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

export function createServer({ cwd = process.cwd(), send }) {
  const dir = appDir(cwd);
  const jobs = new Map();

  const load = () => readSession(dir);
  const save = (session) => writeSession(dir, session);

  function turn(session) {
    const t = nextTurn(session.answers);
    session.step = t.step;
    if (t.spec) session.spec = t.spec;
    save(session);
    if (session.spec) writeSpecDocument(dir, session);
    const { spec, ...rest } = t;
    return rest;
  }

  function startJob(kind, run) {
    const job = { kind, state: 'running', log: [], started: Date.now(), result: null };
    const log = (line) => {
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
      job.onLog?.(line);
    };
    job.promise = run(log)
      .then((result) => Object.assign(job, { state: 'done', result }))
      .catch((error) => Object.assign(job, { state: 'done', result: { ok: false, message: `Prism failed: ${error.message}` } }));
    jobs.set(kind, job);
    return job;
  }

  async function awaitJob(job, waitSeconds, progress) {
    const timer = new Promise((done) => setTimeout(done, Math.max(0, Math.min(waitSeconds, 600)) * 1000));
    let tick = 0;
    job.onLog = (line) => progress?.(++tick, line);
    await Promise.race([job.promise, timer]);
    job.onLog = null;
    const elapsed = Math.round((Date.now() - job.started) / 1000);
    if (job.state === 'running') return { state: 'running', elapsed, latest: job.log.slice(-3), next: `Still working after ${elapsed} s. Call ${job.kind === 'build' ? 'prism_build' : 'prism_prove'} again to keep waiting.` };
    jobs.delete(job.kind);
    return { state: 'done', elapsed, ...job.result };
  }

  async function longTool(kind, args, progress) {
    const session = load();
    if (!session.spec || session.step !== 'ready') {
      const t = nextTurn(session.answers);
      if (t.step !== 'ready') return { state: 'blocked', message: `The spec is not complete yet. Next question: ${t.question}`, step: t.step };
      session.spec = t.spec;
    }
    const other = jobs.get(kind === 'build' ? 'prove' : 'build');
    if (other) return { state: 'busy', message: `A ${other.kind} is running; call prism_${other.kind} to follow it.` };
    // A job another Prism server started (an agent that restarted its server) is not
    // started twice; that server finishes it and saves the result here.
    const elsewhere = session.status.job;
    if (!jobs.get(kind) && elsewhere && elsewhere.pid !== process.pid && alive(elsewhere.pid)) {
      const elapsed = Math.round((Date.now() - elsewhere.started) / 1000);
      return { state: 'running', elapsed, next: `A ${elsewhere.kind} another Prism server started ${elapsed} s ago is still running. Call prism_${kind} again to keep waiting; it returns the result when that one finishes.` };
    }
    if (!jobs.get(kind) && kind === 'build' && session.status.lastBuild && session.status.lastBuild.modelSha === session.status.modelSha && session.status.lastSpec === JSON.stringify(session.spec) && existsSync(session.status.lastBuild.holo ?? '')) {
      return { state: 'done', elapsed: 0, ...session.status.lastBuild.result, note: 'Nothing changed since this build, so it was not built again.' };
    }
    const job =
      jobs.get(kind) ??
      startJob(kind, async (log) => {
        const s = load();
        s.spec = validateSpec(s.spec ?? session.spec);
        s.status.job = { kind, pid: process.pid, started: Date.now() };
        save(s);
        const result = kind === 'build' ? await build(dir, s, { log, overwrite: args.overwrite, remote: args.remote ?? null, root: cwd, repository: args.repository ?? null }) : await prove(dir, s, { log, overwrite: args.overwrite });
        if (kind === 'prove' || result.ok) s.status.lastSpec = JSON.stringify(s.spec);
        if (kind === 'build' && result.ok) s.status.lastBuild = { modelSha: s.status.modelSha, holo: result.holo, result };
        delete s.status.job;
        // Answers given while the job ran stay; only what the job learned is merged in.
        const latest = load();
        save({ ...latest, status: s.status, axioms: s.axioms, image: s.image ?? latest.image });
        return result;
      });
    return awaitJob(job, args.wait ?? 45, progress);
  }

  const tools = {
    prism_start(args) {
      const session = args.restart ? { ...load(), step: 'purpose', answers: {}, spec: null, status: {}, axioms: {} } : load();
      const t = turn(session);
      const resumed = Object.keys(session.answers).length > 0;
      return { greeting: resumed ? `Welcome back. ${t.progress}.` : GREETING, project: dir, ...t };
    },
    prism_answer(args) {
      const session = load();
      const step = args.step ?? session.step ?? nextTurn(session.answers).step;
      if (step === 'ready') return { message: 'The spec is complete. Call prism_build to prove and build it, or pass step to change an answer.' };
      session.answers[step] = args.answer;
      if (step !== 'review') delete session.answers.review;
      return turn(session);
    },
    prism_spec(args) {
      const session = load();
      if (!args.spec) return { spec: session.spec ?? nextTurn(session.answers).spec ?? null, step: session.step };
      session.answers = { ...answersFromSpec(args.spec), review: undefined };
      delete session.answers.review;
      return turn(session);
    },
    prism_prove: (args, progress) => longTool('prove', args, progress),
    prism_build: (args, progress) => longTool('build', args, progress),
    async prism_try(args) {
      const session = load();
      const t = nextTurn(session.answers);
      if (!t.spec && !session.spec) return { message: 'There is no complete spec yet to answer from.' };
      return tryRequest({ ...session, spec: session.spec ?? t.spec }, args.request);
    },
    prism_status() {
      const session = load();
      const t = nextTurn(session.answers);
      return {
        project: dir,
        step: t.step,
        question: t.question,
        properties: session.status.properties ?? {},
        proved: session.status.proved ?? null,
        built: session.status.built ?? null,
        holo: session.status.holo ?? null,
        jobs: [...jobs.values()].map((j) => ({ kind: j.kind, state: j.state, elapsed: Math.round((Date.now() - j.started) / 1000), latest: j.log.slice(-3) })),
      };
    },
  };

  const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  async function handle(message) {
    const { id, method, params = {} } = message;
    const isRequest = id !== undefined && id !== null;
    try {
      switch (method) {
        case 'initialize': {
          const requested = params.protocolVersion;
          return reply(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: 'prism', title: 'Prism', version },
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping':
          return reply(id, {});
        case 'tools/list':
          return reply(id, { tools: TOOLS });
        case 'tools/call': {
          const tool = tools[params.name];
          if (!tool) return error(id, -32602, `Unknown tool: ${params.name}`);
          const token = params._meta?.progressToken;
          const progress = token === undefined ? null : (n, line) => send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: n, message: line } });
          let result;
          try {
            result = await tool(params.arguments ?? {}, progress);
          } catch (e) {
            if (e instanceof SpecError) return reply(id, { content: [{ type: 'text', text: e.message }], structuredContent: { issue: e.message }, isError: true });
            throw e;
          }
          const isError = result && (result.ok === false || result.state === 'blocked');
          return reply(id, { content: [{ type: 'text', text: text(result) }], structuredContent: result, ...(isError ? { isError: true } : {}) });
        }
        case 'prompts/list':
          return reply(id, { prompts: PROMPTS });
        case 'prompts/get':
          if (params.name !== 'prism') return error(id, -32602, `Unknown prompt: ${params.name}`);
          return reply(id, { description: PROMPTS[0].description, messages: [{ role: 'user', content: { type: 'text', text: 'Call the prism_start tool and follow what it returns: draft the whole spec from what I want, and show it to me for approval before you build.' } }] });
        case 'resources/list':
          return reply(id, {
            resources: [
              { uri: 'prism://spec', name: 'SPEC.md', description: 'The spec in prose, with what is proved', mimeType: 'text/markdown' },
              { uri: 'prism://model', name: 'model', description: 'The generated LexLean model', mimeType: 'application/x-tex' },
              { uri: 'prism://status', name: 'status', description: 'Session progress, proofs and build', mimeType: 'application/json' },
            ],
          });
        case 'resources/templates/list':
          return reply(id, { resourceTemplates: [] });
        case 'resources/read': {
          const session = load();
          const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
          const contents = {
            'prism://spec': () => ({ mimeType: 'text/markdown', text: read(join(dir, 'SPEC.md')) || 'No spec yet.' }),
            'prism://model': () => ({ mimeType: 'application/x-tex', text: session.spec ? read(modelPath(dir, session.spec)) || 'Not generated yet.' : 'Not generated yet.' }),
            'prism://status': () => ({ mimeType: 'application/json', text: text(tools.prism_status()) }),
          }[params.uri];
          if (!contents) return error(id, -32602, `Unknown resource: ${params.uri}`);
          return reply(id, { contents: [{ uri: params.uri, ...contents() }] });
        }
        case 'logging/setLevel':
          return reply(id, {});
        case 'completion/complete':
          return reply(id, { completion: { values: [], hasMore: false } });
        default:
          if (method?.startsWith('notifications/')) return undefined;
          if (isRequest) return error(id, -32601, `Method not found: ${method}`);
          return undefined;
      }
    } catch (e) {
      if (isRequest) return error(id, -32603, e.message);
      return undefined;
    }
  }
  /** Settles when no job runs, so a closing server still saves what its jobs learn. */
  const idle = () => Promise.allSettled([...jobs.values()].map((j) => j.promise));
  return { handle, dir, idle };
}

/** Serve on stdin and stdout until stdin closes. */
export function serveStdio({ cwd = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const server = createServer({ cwd, send: (message) => output.write(`${JSON.stringify(message)}\n`) });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    for (const m of Array.isArray(message) ? message : [message]) {
      const p = server.handle(m);
      pending.add(p);
      p.finally(() => pending.delete(p));
    }
  });
  return new Promise((done) => lines.on('close', () => Promise.allSettled([...pending]).then(() => server.idle()).then(() => done(server))));
}
