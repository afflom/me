/**
 * A set of prompts to one Prism application: several decision apps in the one
 * `app/` of a repository created from UOR-Foundation/template.
 *
 * A prismpm project has one root `application`, so one guest and one holo, and
 * the template's gate verifies and publishes `app/` alone. A set therefore
 * keeps every app's model and proofs as a module pair, as `build` writes them,
 * and adds a router module whose `application` is the root: its guest reads the
 * app's name, then a space, and answers the rest exactly as that app's own
 * `dispatch` does. Every app's acceptance vectors, prefixed with its name, are
 * the router's, so `prismpm verify` replays all of them in the one guest.
 *
 * The facet modules describe the one system, as ISO/IEC/IEEE 42010 asks of an
 * architecture description: each app's records keep their own names (the app's
 * module name follows each record's prefix), while what the apps share is one
 * record: the stakeholders, the platform components (browser, build, Pages,
 * source), the components the prompts name alike, and the ISO/IEC 25010
 * characteristics and subcharacteristics.
 *
 * The id prefix of an app's claims is the initials of every word of its name,
 * so apps whose two-letter prefixes would collide keep distinct ids. Rows,
 * entrypoints and files the set does not own are kept, so a set can share its
 * repository with other generated modules.
 */
import { declarationText, names } from './vendor/prism-code/src/journey/render.mjs';
import { renderSpecDocument, declarations } from './vendor/prism-code/src/journey/render.mjs';
import { TEMPLATE_EXAMPLE, claims as propertyClaims, suiteOf } from './vendor/prism-code/src/journey/template.mjs';
import { SpecError, describeConditions, respond, requestLimits } from './vendor/prism-code/src/journey/spec.mjs';
import { ASSETS, TEMPLATE } from './assets.mjs';
import { FACET_CLAIMS, rustTests } from './build.mjs';
import { facetModules } from './facets.mjs';
import { listDefinitions, reflow } from './lean.mjs';
import { renderMachineModel, renderMachineProofs } from './machine.mjs';
import { deriveModel } from './model.mjs';
import { DFD_OF, STRIDE, STRIDE_PER_ELEMENT, STRIDE_TEXT } from './prompt.mjs';

export const SET_SCHEMA = 'prism/prompt-set/1';

const pascal = (s) =>
  String(s)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'X';
const enc = (s) => new TextEncoder().encode(s);
const hex = (bytes) => `0x${Buffer.from(typeof bytes === 'string' ? enc(bytes) : bytes).toString('hex')}`;
const quote = (text) => `"${String(text).replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '')}"`;
const INVALID = 'invalid';
const QP = '[Quot.sound, propext]';

/** Records sorted by declaration name and numbered in that order, as the SDK numbers facet records. */
function indexed(records) {
  const sorted = [...records].sort((a, b) => (a.decl < b.decl ? -1 : a.decl > b.decl ? 1 : 0));
  sorted.forEach((r, i) => (r.index = i));
  return sorted;
}

/** Replace every string in `value` (deeply, in place) that the map renames. */
function renameStrings(value, map) {
  if (Array.isArray(value)) value.forEach((v, i) => (typeof v === 'string' && map.has(v) ? (value[i] = map.get(v)) : renameStrings(v, map)));
  else if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && map.has(v)) value[k] = map.get(v);
      else if (v && typeof v === 'object' && !['owner', 'viewpoint', 'view', 'source', 'target', 'trigger', 'component', 'from', 'to', 'stakeholder', 'concern', 'actor', 'requirement', 'subcharacteristic', 'characteristic', 'risk', 'threat', 'assetRecord'].includes(k)) renameStrings(v, map);
    }
  }
}

/** The set file, checked: every field it needs, with the prompts read by the caller. */
export function readSet(set) {
  if (!set || set.schema !== SET_SCHEMA) throw new SpecError(`A prompt set is \`${SET_SCHEMA}\`.`, 'schema');
  for (const key of ['name', 'title', 'purpose', 'repository']) if (typeof set[key] !== 'string' || !set[key].trim()) throw new SpecError(`The set needs \`${key}\`.`, key);
  if (!/^[a-z][a-z0-9-]*$/.test(set.name)) throw new SpecError('The set name is lowercase words joined by hyphens.', 'name');
  if (!Array.isArray(set.prompts) || set.prompts.length < 1) throw new SpecError('The set lists at least one prompt.', 'prompts');
  if (set.root !== undefined && !(set.root && typeof set.root.module === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(set.root.module))) throw new SpecError('`root.module` names the repository\'s own root module, such as Prism.', 'root');
  return { license: 'MIT OR Apache-2.0', axioms: {}, ...set };
}

/**
 * Claim ids: the initials of every word of the app's name. A prefix a row of
 * another suite already holds (`taken`), or an earlier app of the set holds, is
 * lengthened by the next letters of the name's last word until it is free.
 * Refused when two apps would still share one.
 */
function idPrefixes(models, taken = new Set()) {
  const out = new Map();
  for (const m of models) {
    const words = m.spec.name.split(/[^a-z0-9]+/).filter(Boolean);
    const p = words.map((w) => w[0]).join('').toUpperCase();
    let prefix = p === 'CM' ? 'CN' : p;
    const last = words.at(-1).toUpperCase();
    // A prefix an earlier app of the set holds is lengthened the same way, so the first app keeps it.
    const held = (x) => taken.has(x) || [...out.values()].includes(x);
    for (let k = 1; held(prefix) && k < last.length; k++) prefix = `${p}${last.slice(1, k + 1)}`;
    if (taken.has(prefix)) throw new SpecError(`Every id prefix of ${m.spec.name} is held by another suite's rows; rename the app.`, 'prompts');
    if ([...out.values()].includes(prefix)) throw new SpecError(`Two apps of the set would both claim ${prefix}-xx; rename one.`, 'prompts');
    out.set(m, prefix);
  }
  return out;
}

/** One model of the facets of every app in the set: the records each app derives, with what they share made one. */
export function mergeModels(set, models) {
  const P = 'Architecture::';
  const rename = new Map();
  // ---- Architecture: shared stakeholders and components become one record.
  const stakeholders = new Map();
  for (const m of models)
    for (const s of m.architecture.stakeholders) {
      const kept = stakeholders.get(s.name);
      if (kept) {
        for (const v of m.architecture.viewpoints) if (v.stakeholder === s) v.stakeholder = kept;
        for (const j of m.features.journeys) if (j.actor === s) j.actor = kept;
      } else {
        s.decl = `stakeholder${pascal(s.name)}`;
        stakeholders.set(s.name, s);
      }
    }
  const shared = new Set(['browser', 'build', 'host', 'source']);
  const text = {
    browser: `The visitor's web browser, which loads the page and runs the ${set.title} guest.`,
  };
  const components = new Map();
  const ownComponents = [];
  for (const m of models)
    for (const c of m.architecture.components) {
      const key = shared.has(c.key) ? c.key : c.key.startsWith('extra:') ? c.key : null;
      if (!key) {
        ownComponents.push(c);
        continue;
      }
      const kept = components.get(key);
      const old = `${P}${c.decl}`;
      if (kept) {
        rename.set(old, `${P}${kept.decl}`);
        for (const e of m.architecture.edges) {
          if (e.from === c) e.from = kept;
          if (e.to === c) e.to = kept;
        }
        for (const a of m.security.assets) if (a.component === c) a.component = kept;
        for (const s of m.design.processes) if (s.owner === c) s.owner = kept;
        for (const s of m.design.states) if (s.owner === c) s.owner = kept;
      } else {
        c.decl = `component${pascal(c.name)}`;
        if (text[key]) c.text = text[key];
        rename.set(old, `${P}${c.decl}`);
        components.set(key, c);
      }
    }
  const allComponents = [...components.values(), ...ownComponents];
  // Edges between shared components are one edge; the rest stay the app's.
  const edges = new Map();
  for (const m of models)
    for (const e of m.architecture.edges) {
      const key = `${e.from.decl}|${e.to.decl}|${e.kind}`;
      const old = `${P}${e.decl}`;
      const kept = edges.get(key);
      if (kept) rename.set(old, `${P}${kept.decl}`);
      else {
        if (allComponents.indexOf(e.from) < components.size && allComponents.indexOf(e.to) < components.size) e.decl = `edge${pascal(`${e.from.name} to ${e.to.name}`)}`;
        rename.set(old, `${P}${e.decl}`);
        edges.set(key, e);
      }
    }
  // A concern is the app's own; its name says which app when two apps name it alike.
  const concernNames = new Map();
  for (const m of models) for (const c of m.architecture.concerns) concernNames.set(c.name, (concernNames.get(c.name) ?? 0) + 1);
  for (const m of models) for (const c of m.architecture.concerns) if (concernNames.get(c.name) > 1) c.name = `${c.name}: ${m.title}`;

  const architecture = {
    stakeholders: indexed([...stakeholders.values()]),
    concerns: indexed(models.flatMap((m) => m.architecture.concerns)),
    components: indexed(allComponents),
    edges: indexed([...edges.values()]),
    viewpoints: indexed(models.flatMap((m) => m.architecture.viewpoints)),
    views: indexed(models.flatMap((m) => m.architecture.views)),
  };

  // ---- Design: every app's views, with references to merged records renamed.
  const keys = ['processes', 'states', 'views', 'opmThings', 'opmStates', 'opmLinks', 'opmZooms', 'umlComponents', 'umlConnectors', 'lifelines', 'messages', 'umlStates', 'transitions'];
  const design = Object.fromEntries(keys.map((k) => [k, models.flatMap((m) => m.design[k])]));
  renameStrings(design, rename);

  // ---- Features and journeys.
  const features = { features: models.flatMap((m) => m.features.features), journeys: models.flatMap((m) => m.features.journeys) };

  // ---- Security: STRIDE per element over the merged components and data flows.
  const elements = [
    ...architecture.components.map((c) => ({ name: c.name, dfd: DFD_OF[c.kind], decl: c.decl })),
    ...architecture.edges.map((e) => ({ name: `${e.from.name} to ${e.to.name}`, dfd: 'dataFlow', decl: e.decl })),
  ].map((x, index) => ({ ...x, index }));
  const elementNamed = new Map(elements.map((x) => [x.name, x]));
  const threats = indexed(models.flatMap((m) => m.security.threats));
  for (const t of threats) {
    const merged = elementNamed.get(t.target.name);
    if (!merged) throw new Error(`the threat ${t.name} acts on ${t.target.name}, which the merged model does not declare`);
    t.target = merged;
  }
  const strideOpen = elements.flatMap((x) =>
    STRIDE.filter((category) => STRIDE_PER_ELEMENT[x.dfd].includes(category) && !threats.some((t) => t.target === x && t.stride === category)).map((category) => ({ element: x, category, name: `${STRIDE_TEXT[category]} of ${x.name}` })),
  );
  const security = {
    assets: indexed(models.flatMap((m) => m.security.assets)),
    threats,
    risks: indexed(models.flatMap((m) => m.security.risks)),
    controls: indexed(models.flatMap((m) => m.security.controls)),
    mappings: models.flatMap((m) => m.security.mappings),
    elements,
    strideOpen,
  };

  // ---- Quality: ISO/IEC 25010 characteristics and subcharacteristics are the standard's, so one record each.
  const characteristics = new Map();
  const subcharacteristics = new Map();
  for (const m of models) {
    for (const c of m.quality.characteristics)
      if (!characteristics.has(c.name)) {
        c.decl = `characteristic${pascal(c.name)}`;
        c.text = `${c.name}, as ISO/IEC 25010:2023 defines it, for ${set.title}.`;
        characteristics.set(c.name, c);
      }
    for (const s of m.quality.subcharacteristics) {
      s.characteristic = characteristics.get(s.characteristic.name);
      if (!subcharacteristics.has(s.name)) {
        s.decl = `subcharacteristic${pascal(s.name)}`;
        subcharacteristics.set(s.name, s);
      }
    }
    for (const r of m.quality.requirements) {
      r.subcharacteristic = subcharacteristics.get(r.subcharacteristic.name);
      r.name = `${r.name}: ${m.title}`;
    }
    for (const x of m.quality.measures) x.name = `${x.name}: ${m.title}`;
  }
  const requirements = indexed(models.flatMap((m) => m.quality.requirements));
  const quality = {
    characteristics: indexed([...characteristics.values()]),
    subcharacteristics: indexed([...subcharacteristics.values()]),
    requirements,
    measures: indexed(models.flatMap((m) => m.quality.measures)),
  };
  quality.openSubcharacteristics = quality.subcharacteristics.filter((x) => !requirements.some((r) => r.subcharacteristic === x));

  // ---- Compliance: one obligation per standard and subject, with every app's evidence.
  const obligations = new Map();
  for (const m of models)
    for (const o of m.compliance) {
      // The three facet theorems are the set's; every other obligation is an app's, so no evidence list outgrows a list part.
      const own = !['Architecture description', 'Product quality', 'Application security and risk', 'Control set'].includes(o.subject);
      const subject = own ? `${m.title}: ${o.subject}` : o.subject;
      const key = `${o.standard}|${subject}`;
      const kept = obligations.get(key);
      if (kept) kept.evidence = [...new Set([...kept.evidence, ...o.evidence])];
      else obligations.set(key, { ...o, subject, evidence: [...o.evidence] });
    }

  // The set's own obligations state the merged counts.
  const counted = {
    'Product quality': `All ${quality.characteristics.length} characteristics and ${quality.subcharacteristics.length} subcharacteristics are declared; each subcharacteristic is stated by a requirement with a measure or listed open (${quality.openSubcharacteristics.length} open); every parent resolves.`,
    'Application security and risk': `Every threat has a STRIDE category and a mapped control with evidence, or an accepted risk with its rationale; every category STRIDE per element opens on the ${elements.length} components and data flows is answered by a threat or stated open (${strideOpen.length} open).`,
  };
  for (const o of obligations.values()) if (counted[o.subject]) o.text = counted[o.subject];

  return {
    title: set.title,
    modules: models.flatMap((m) => [m.module]),
    controlText: `${set.title} answers one request with one answer in a Core-Wasm guest granted no capability. ${set.purpose}`,
    lastModified: models[0].lastModified,
    architecture,
    design,
    features,
    security,
    quality,
    compliance: [...obligations.values()],
  };
}

/**
 * The guest is one Rust crate, which names every compiled declaration by its
 * last component alone, so two apps may not both declare `judge` or `byteAt`.
 * Each app module's declarations take its module's name, camel-cased, before
 * their own (`uorRepoFilesJudge`; the request type `UorRepoFilesRequest`), and
 * every reference to them, in the module, its proofs, the facets and the
 * claims, is renamed with them.
 */
function scope(m) {
  const lead = m.module[0].toLowerCase() + m.module.slice(1);
  const model = renderMachineModel(m.spec, m.machine ?? null, {});
  const decls = [...model.matchAll(/^(?:definition|structure|inductive)\{(?:\n  )?name: ([A-Za-z_][A-Za-z0-9_]*),/gm)].map((x) => x[1]).filter((x) => x !== 'application');
  const map = new Map(decls.map((d) => [d, d === 'Request' ? `${m.module}Request` : `${lead}${d[0].toUpperCase()}${d.slice(1)}`]));
  const word = new RegExp(`(?<![A-Za-z0-9_:.])(${decls.join('|')})(?![A-Za-z0-9_])`, 'g');
  const ref = new RegExp(`(?<![A-Za-z0-9_.])${m.module}::([A-Za-z_][A-Za-z0-9_]*)`, 'g');
  m.scopedDispatch = map.get('dispatch');
  return {
    text: (t) => reflow(t.replace(word, (x) => map.get(x))),
    refs: (t) => reflow(t.replace(ref, (x, name) => (map.has(name) ? `${m.module}::${map.get(name)}` : x))),
    qualified: new Map([...map].map(([k, v]) => [`${m.module}::${k}`, `${m.module}::${v}`])),
  };
}

/** The router: what the one guest answers, the app named first deciding the rest. */
export function routerRespond(router, bytes) {
  if (bytes.length > router.requestMaximum) return INVALID;
  const e = bytes.indexOf(0x20);
  if (e < 0) return INVALID;
  const name = Buffer.from(bytes.slice(0, e)).toString('latin1');
  const app = router.apps.find((a) => a.spec.name === name);
  return app ? respond(app.spec, bytes.slice(e + 1)) : INVALID;
}

function routerOf(set, models) {
  const requestMaximum = Math.max(...models.map((m) => requestLimits(m.spec).requestMaximum + m.spec.name.length + 1));
  const router = { name: set.name, module: pascal(set.name), requestMaximum, responseMaximum: 64, guestAllocationMaximum: requestMaximum * 2, apps: models };
  router.prefix = `Prism${router.module}`;
  const out = [];
  const seen = new Set();
  const add = (bytes, why) => {
    const key = Buffer.from(bytes).toString('hex');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ bytes, response: routerRespond(router, bytes), why });
  };
  // The browser oracle keeps at most 64 KiB of replay evidence for one guest,
  // so the router replays, per app, the first vector that gives each of its
  // answers and the first it refuses: every path through every app's compiled
  // decision, which the Lean kernel has proved for every request.
  for (const m of models) {
    const answered = new Set();
    for (const v of m.vectors) {
      if (answered.has(v.response)) continue;
      answered.add(v.response);
      add(Uint8Array.from([...enc(`${m.spec.name} `), ...v.bytes]), `${m.spec.name}: ${v.why}`);
    }
  }
  add(enc(''), 'empty request');
  add(Uint8Array.of(0xff), 'not UTF-8');
  add(enc(models[0].spec.name), 'an app name and nothing else');
  add(enc(`${models[0].spec.name} `), 'an app name and an empty request');
  add(enc(`unknown ${models[0].spec.examples[0]?.request ?? 'x'}`), 'no app of that name');
  add(enc('x'.repeat(requestMaximum)), 'exactly the request bound');
  add(enc('x'.repeat(requestMaximum + 1)), 'one byte over the request bound');
  add(enc('x'.repeat(router.guestAllocationMaximum)), 'exactly the guest allocation bound');
  router.vectors = out;
  return router;
}

function renderRouter(set, router) {
  const first = router.apps[0];
  // The byte helpers are prism-code's own, as every app module declares them.
  const helpers = declarations(first.spec, first.names).filter((d) => ['byteAt', 'sliceOf', 'fieldEnd'].includes(d.name));
  const len = '(Foundation.Bytes::byteLength value)';
  const rest = `(sliceOf value (e + 1) (prim subtract ${len} (e + 1) : Nat))`;
  const axioms = (name, fallback) => (set.axioms[name] ? `[${set.axioms[name].join(', ')}]` : fallback);
  // One small definition per app, tried in order: one term over every app is past what Lean's code generator inlines.
  const route = (i) => `route${i + 1}`;
  const routes = router.apps
    .map((m, i) => ({
      kind: 'definition',
      name: route(i),
      parameters: ['name : Bytes', 'rest : Bytes'],
      result: 'Bytes',
      body: `(if (prim equal name ${hex(m.spec.name)} : Bool) then (${m.module}::${m.scopedDispatch} rest) else ${i + 1 < router.apps.length ? `(${route(i + 1)} name rest)` : hex(INVALID)})`,
      axioms: axioms(route(i), QP),
    }))
    .reverse();
  const dispatch = {
    kind: 'definition',
    name: 'dispatch',
    parameters: ['value : Bytes'],
    result: 'Bytes',
    body: `(if (${router.requestMaximum} <? ${len}) then ${hex(INVALID)} else (let e : Nat := (fieldEnd value 0 ${len}); (if (e <? ${len}) then (${route(0)} (sliceOf value 0 e) ${rest}) else ${hex(INVALID)})))`,
    axioms: axioms('dispatch', QP),
  };
  const root = `${router.prefix}.${router.module}.dispatch`;
  const AV = 'Foundation.View.Text.V1.Model::AcceptanceVector';
  // Every app's vectors are many more than one list literal holds, so they are written in parts.
  const vectorDecls = listDefinitions('vectors', AV, router.vectors.map((v) => `(record ${AV} {request := ${hex(v.bytes)}, response := ${hex(v.response)}})`));
  const view = `(record Foundation.View.Text.V1.Model::TextView {title := ${quote(set.title)}, heading := ${quote(set.title)}, inputLabel := "Request: an app, then its fields", submitLabel := "Decide", outputLabel := "Answer", inputError := "Invalid request", responseError := "Invalid response"})`;
  const application = {
    kind: 'definition',
    name: 'application',
    parameters: [],
    result: 'Foundation.View.Text.V1.Model::TextApplication',
    body: `(record Foundation.View.Text.V1.Model::TextApplication {profile := "prismpm/text-application/1", name := ${quote(set.title)}, cargoName := ${quote(`prism-${set.name}`)}, cargoVersion := "0.1.0", cargoDescription := ${quote(set.purpose.slice(0, 200))}, cargoRepository := ${quote(`https://github.com/${set.repository}`)}, cargoHomepage := ${quote(`https://github.com/${set.repository}`)}, libraryRoots := (cons ${quote(root)} (nil String)), acceptanceVectors := (vectors), entryRoot := ${quote(root)}, coreContract := "hologram:guest/core-wasm@1", requestMaximum := (${router.requestMaximum} : UInt32), responseMaximum := (${router.responseMaximum} : UInt32), guestAllocationMaximum := (${router.guestAllocationMaximum} : UInt32), capabilitiesEmpty := true, fatArchive := true, primaryLayer := (0 : UInt8), viewLayer := (1 : UInt8), view := ${view}})`,
  };
  const decls = [...helpers, ...routes, dispatch, ...vectorDecls, application].map((d) => (set.axioms[d.name] ? { ...d, axioms: axioms(d.name, d.axioms) } : d));
  return [
    `\\begin{lexlean}{${router.module}}`,
    '\\useglossary{lexlean.std.bool@1.2.0}',
    '\\useglossary{lexlean.std.nat@1.2.0}',
    '\\useglossary{prism.arch@1.0.0}',
    '\\importmodule{Foundation.Bytes}',
    '\\importmodule{Foundation.View.Text.V1.Model}',
    ...router.apps.map((m) => `\\importmodule{${m.module}}`),
    '\\title{Text application model}',
    '\\begin{semanticmodule}',
    decls.map(declarationText).join('\n\n'),
    '\\end{semanticmodule}',
    '\\end{lexlean}',
    '',
  ].join('\n');
}

const tomlString = (text) => JSON.stringify(text);
const row = (c) => `[[id]]\nid = "${c.id}"\nlevel = "build"\nsuite = "${c.suite}"\nstatement = ${tomlString(c.statement)}\n`;

/** `model/ids.toml`: the rows of suites the set does not own kept as they are, the set's rows after them. */
function idsToml(current, owned, claims) {
  const at = current.indexOf('[[id]]');
  const head = (at < 0 ? current : current.slice(0, at)).replace(/\n*$/, '\n\n');
  const rows = at < 0 ? [] : current.slice(at).split(/(?=^\[\[id\]\]$)/m).map((r) => r.replace(/\n*$/, '\n'));
  const kept = rows.filter((r) => !owned.has(/^suite = "([^"]+)"$/m.exec(r)?.[1]));
  return `${head}${[...kept, ...claims.map(row)].join('\n')}`;
}

function scenarios(suite, purpose, claims) {
  const lines = [`Feature: ${suite}`, '', "  This repository's Prism application, in app/, built by the Prism-DevRel", `  builder from its prompt set: ${purpose.replace(/\s+/g, ' ').trim()}`];
  for (const c of claims) {
    lines.push('', `  @${c.id} @build`, `  Scenario: ${c.statement}`);
    if (c.kind === 'property') lines.push(`    Given the model in app/src/${c.module}.lex.tex`, `    When the Lean kernel checks ${c.theorem} during prismpm verify`, `    Then no request meets ${c.breaks}`);
    else lines.push(`    Given the model in app/src/${c.module}.lex.tex`, `    When the Lean kernel checks ${c.theorem} during prismpm verify`, `    Then ${c.statement.charAt(0).toLowerCase()}${c.statement.slice(1)}`);
  }
  return `${lines.join('\n')}\n`;
}

function siteJson(set, router, claims) {
  const app = JSON.parse(TEMPLATE['site/app.json']);
  const url = `https://github.com/${set.repository}`;
  const [owner, repo] = set.repository.split('/');
  const props = claims.filter((c) => c.kind === 'property');
  const first = router.apps[0];
  const list = (items) => items.join(', ').replace(/, ([^,]*)$/, ' or $1');
  const outcomes = [...new Set(router.apps.flatMap((m) => m.spec.outcomes))];
  return `${JSON.stringify(
    {
      ...app,
      name: set.title,
      shortName: set.title.split(/\s+/)[0].slice(0, 12),
      live: `https://${owner.toLowerCase()}.github.io/${repo}/`,
      purpose: `${set.purpose.replace(/\.$/, '')}. Send the name of one of ${list(router.apps.map((m) => m.spec.name))}, a space, then that app's fields; it answers as that app does, and invalid request for anything else.`,
      inputLabel: 'Request: an app, then its fields',
      placeholder: `${first.spec.name} ${first.spec.examples[0]?.request ?? ''}`.trim(),
      submitLabel: 'Decide',
      outputLabel: 'Answer',
      answers: { positive: outcomes.slice(0, 1), negative: outcomes.slice(1), refusal: 'invalid request' },
      claim: props.map((c) => `${c.id}: ${c.statement.replace(/^The app/, `the ${c.app} app`)}.`).join(' '),
      proposition: { name: 'dispatch', text: router.apps.map((m) => `${m.spec.name} request := ${m.module}.judge request`).join('\n'), plain: set.purpose },
      theorems: props.map((c) => ({ name: c.theorem, statement: `no request meets ${c.breaks}: ${c.statement.replace(/^The app/, `the ${c.app} app`)}`, how: 'Proved by linear arithmetic, checked by the Lean kernel by prismpm verify in CI', where: `app/src/${c.proofs}.lex.tex` })),
      pinned: props.map((c) => ({ name: c.test, what: `${c.id}'s condition and the theorem that no request meets it. A string-matching test, not a theorem: a planted defect fails it.`, where: `crates/conformance/tests/${c.suite}.rs` })),
      attestations: {
        proof: { id: 'not recorded: the proof ran in the SDK image, not on the UOR MCP server', url: `${url}/actions/workflows/bootstrap.yml` },
        build: { id: 'printed by prismpm verify in every pages run', url: `${url}/actions/workflows/pages.yml` },
      },
      repository: url,
      report: `${url}/blob/main/TEMPLATE-VERIFICATION.md`,
    },
    null,
    2,
  )}\n`;
}

/**
 * Every file of the set's application, by path from the repository root.
 * `current` reads a file of the repository as it is (or undefined), so the
 * rows, entrypoints and files the set does not own are kept.
 */
export async function buildSet(input, prompts, { lastModified, current = () => undefined } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(lastModified ?? '')) throw new TypeError('lastModified is an instant, YYYY-MM-DDThh:mm:ssZ');
  const set = readSet(input);
  const models = prompts.map((p) => {
    const m = deriveModel(p, { scope: pascal(p?.app?.name ?? '') });
    m.lastModified = lastModified;
    return m;
  });
  const names_ = models.map((m) => m.spec.name);
  if (new Set(names_).size !== names_.length) throw new SpecError('Two prompts of the set name the same app.', 'prompts');
  const router = routerOf(set, models);
  if (models.some((m) => m.module === router.module)) throw new SpecError(`The set's router module ${router.module} is also an app's module; rename the set.`, 'name');
  const setSuite = suiteOf({ name: set.name });
  const owns = new Set([setSuite, ...models.map((m) => m.suite)]);
  // The prefixes rows of suites the set does not own already hold.
  const taken = new Set([...(current('model/ids.toml') ?? '').matchAll(/^id = "([A-Z0-9]+)-\d+"\n(?:[a-z]+ = .*\n)*?suite = "([^"]+)"/gm)].filter((x) => !owns.has(x[2])).map((x) => x[1]));
  const prefixes = idPrefixes(models, taken);
  const files = {};
  const app = (path, text) => (files[`app/${path}`] = text);
  for (const [path, text] of Object.entries(ASSETS)) app(path, text);
  const scoped = new Map(models.map((m) => [m, scope(m)]));
  const merged = mergeModels(set, models);
  renameStrings(merged.features, new Map(models.flatMap((m) => [...scoped.get(m).qualified])));
  for (const o of merged.compliance) o.evidence = o.evidence.map((e) => models.reduce((x, m) => scoped.get(m).qualified.get(x) ?? x, e));
  // What each app's application accepted, the router's application now accepts.
  // A set hosted by a repository's own root (`root.module`) leaves that root, its build and its page to the repository.
  const host = set.root?.module ?? null;
  const roots = new Map(models.map((m) => [`${m.module}::application`, `${host ?? router.module}::application`]));
  renameStrings(merged.features, roots);
  for (const o of merged.compliance) o.evidence = [...new Set(o.evidence.map((e) => roots.get(e) ?? e))];
  for (const [path, text] of Object.entries(facetModules(merged))) app(path, text);
  for (const m of models) {
    const axioms = Object.fromEntries(Object.entries(m.prompt.axioms).map(([name, s]) => [name, `[${s.join(', ')}]`]));
    // A project has one application root (PP2001): the router's. An app module keeps everything but its own.
    const model = renderMachineModel(m.spec, m.machine ?? null, { axioms });
    const withoutRoot = model.replace(/\n\ndefinition\{\n  name: application,\n[\s\S]*?\n\}\n(?=\\end\{semanticmodule\})/, '\n');
    if (withoutRoot === model) throw new Error(`no application declaration found in ${m.module}`);
    app(`src/${m.module}.lex.tex`, scoped.get(m).text(withoutRoot));
    if (m.hasProofs) app(`src/${m.proofs}.lex.tex`, scoped.get(m).refs(renderMachineProofs(m.spec, m.machine ?? null, { axioms })));
    files[`openspec/specs/${m.spec.name}/spec.md`] = renderSpecDocument(m.spec, {});
  }
  if (!host) app(`src/${router.module}.lex.tex`, renderRouter(set, router));

  // lexlean.toml: the set's modules, and every other entrypoint the project already has.
  const ownedSrc = Object.keys(files).filter((p) => p.startsWith('app/src/') && !p.startsWith('app/src/Foundation/') && !p.startsWith('app/src/Production/'));
  const before = current('app/lexlean.toml') ?? '';
  const kept = [...(/^entrypoints = \[(.*)\]$/m.exec(before)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((e) => !ownedSrc.includes(`app/${e}`) && current(`app/${e}`) !== undefined);
  const entrypoints = [...new Set([...ownedSrc.map((p) => p.slice('app/'.length)), ...kept])].sort();
  const lexicons = before.includes('[[lexicon_source]]') ? before.slice(before.indexOf('[[lexicon_source]]'), before.indexOf('[limits]')).replace(/\n*$/, '\n\n') : [['lexlean.std.nat', 'builtin'], ...['prism.arch', 'prism.qual', 'prism.sec'].map((p) => [p, 'path'])].map(([p, k]) => (k === 'builtin' ? `[[lexicon_source]]\npackage = "${p}"\nkind = "builtin"\n` : `[[lexicon_source]]\npackage = "${p}"\nkind = "path"\npath = "language/${p}"\n`)).join('\n') + '\n';
  if (host) {
    const missing = ['prism.arch', 'prism.qual', 'prism.sec'].filter((p) => !before.includes(`package = "${p}"`)).map((p) => `[[lexicon_source]]\npackage = "${p}"\nkind = "path"\npath = "language/${p}"\n\n`).join('');
    app('lexlean.toml', before.replace(/^entrypoints = \[.*\]$/m, `entrypoints = [${entrypoints.map((e) => `"${e}"`).join(', ')}]`).replace('[limits]', `${missing}[limits]`));
  } else app(
    'lexlean.toml',
    [
      'spec = "lexlean/project/1"',
      `name = "prism-${set.name}"`,
      'language = "1.2"',
      `module_prefix = "${router.prefix}"`,
      'source_roots = ["src"]',
      `entrypoints = [${entrypoints.map((e) => `"${e}"`).join(', ')}]`,
      'build_root = ".lexlean"',
      'lockfile = "lexlean.lock"',
      'lean_workspace = "."',
      `lean_toolchain = "${ASSETS['lean-toolchain'].trim()}"`,
      '',
      lexicons.replace(/\n+$/, '\n\n'),
    ].join('\n') + TEMPLATE['app/lexlean.toml'].slice(TEMPLATE['app/lexlean.toml'].indexOf('[limits]')),
  );
  if (!host) app('lakefile.toml', `name = "${router.prefix}"\nversion = "0.1.0"\ndefaultTargets = ["${router.prefix}"]\n\n[[lean_lib]]\nname = "${router.prefix}"\n`);
  if (!host) app('lake-manifest.json', `{"version":"1.2.0","packagesDir":".lake/packages","packages":[],"name":"${router.prefix}","lakeDir":".lake","fixedToolchain":false}`);
  if (!host) app('prismpm.toml', TEMPLATE['app/prismpm.toml'].replace(/^project = ".*"$/m, `project = "${router.module}"`));

  // Claims: each app's properties under its own prefix and suite, then the facet theorems under the set's.
  const claims = [];
  for (const m of models) {
    const prefix = prefixes.get(m);
    const suite = m.suite;
    const own = propertyClaims(m.spec).map((c, i) => {
      const id = `${prefix}-${String(i + 1).padStart(2, '0')}`;
      return { ...c, condition: scoped.get(m).refs(c.condition), kind: 'property', id, suite, app: m.spec.name, module: m.module, proofs: m.proofs, test: `${suite}_${id.toLowerCase().replace('-', '_')}` };
    });
    claims.push(...own);
    if (own.length) {
      files[`features/suites/${suite}.feature`] = scenarios(suite, m.spec.purpose, own);
      files[`crates/conformance/tests/${suite}.rs`] = rustTests({ suite, proofs: m.proofs }, own);
    }
  }
  const setPrefix = pascal(set.name).replace(/[a-z0-9]/g, '');
  const facets = FACET_CLAIMS.map((f, i) => {
    const id = `${setPrefix}-${String(i + 1).padStart(2, '0')}`;
    return { ...f, kind: 'facet', id, suite: setSuite, statement: f.claim, test: `${setSuite}_${id.toLowerCase().replace('-', '_')}`, holds: `((${f.statement}) = true)` };
  });
  if ([...prefixes.values()].includes(setPrefix)) throw new SpecError(`The set's prefix ${setPrefix} is also an app's; rename the set.`, 'name');
  claims.push(...facets);
  files[`features/suites/${setSuite}.feature`] = scenarios(setSuite, set.purpose, facets);
  files[`crates/conformance/tests/${setSuite}.rs`] = rustTests({ suite: setSuite }, facets);
  const owned = new Set([setSuite, ...models.map((m) => m.suite)]);
  files['model/ids.toml'] = idsToml(current('model/ids.toml') ?? TEMPLATE['model/ids.toml'], owned, claims);
  if (!host) files['site/app.json'] = siteJson(set, router, claims);
  return { files, remove: [...TEMPLATE_EXAMPLE, 'app/prompt.json'], set, models, router, claims };
}

export { describeConditions };
