// The builder in the browser: the same buildApp the CLI and the pages workflow
// run, on the prompt in the text area. Nothing leaves the page.
import './buffer-shim.mjs';
import { buildApp, claimLines } from '../build.mjs';
import { zip } from '../zip.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
let built = null;

async function examples() {
  const list = await (await fetch('../examples/prompts/index.json')).json();
  const select = $('example');
  select.innerHTML = list.map((e) => `<option value="${esc(e.prompt)}">${esc(e.title)} (${esc(e.repository)})</option>`).join('') + '<option value="">Your own prompt</option>';
  const wanted = new URLSearchParams(location.search).get('example');
  const first = list.find((e) => e.name === wanted) ?? list[0];
  select.value = first.prompt;
  const load = async () => {
    if (!select.value) return;
    $('prompt').value = await (await fetch(`../examples/prompts/${select.value}`)).text();
    built = null;
    $('download').disabled = true;
    $('result').innerHTML = '';
    $('status').textContent = '';
  };
  select.addEventListener('change', load);
  await load();
}

function show({ files, model: m, claims }) {
  const count = (xs) => xs.length;
  const stats = [
    ['Files', Object.keys(files).length],
    ['Rules', count(m.spec.rules)],
    ['Proved properties', count(m.spec.properties)],
    ['Stakeholders', count(m.architecture.stakeholders)],
    ['Components', count(m.architecture.components)],
    ['Design views', count(m.design.views)],
    ['Features', count(m.features.features)],
    ['Threats', count(m.security.threats)],
    ['Quality measures', count(m.quality.measures)],
    ['Acceptance vectors', count(m.vectors)],
  ];
  const sources = Object.keys(files)
    .filter((p) => !p.includes('/Foundation/') && !p.includes('/Production/') && !p.includes('/language/'))
    .map((p) => `<details class="source"><summary><code>${esc(p)}</code></summary><pre><code>${esc(files[p])}</code></pre></details>`)
    .join('');
  $('result').innerHTML = `<h3>${esc(m.title)}</h3><dl class="stats">${stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl><h4>Claims</h4><ul>${claimLines(claims).map((l) => `<li>${esc(l)}</li>`).join('')}</ul><h4>Files</h4>${sources}`;
}

$('build').addEventListener('click', async () => {
  $('status').textContent = 'Building…';
  $('download').disabled = true;
  try {
    const prompt = JSON.parse($('prompt').value);
    built = await buildApp(prompt, { lastModified: now() });
    show(built);
    $('status').textContent = `Built ${built.model.title}: every facet, ${Object.keys(built.files).length} files.`;
    $('download').disabled = false;
  } catch (error) {
    built = null;
    $('result').innerHTML = '';
    $('status').textContent = `Refused: ${error.message}`;
  }
});

$('download').addEventListener('click', () => {
  if (!built) return;
  const bytes = zip(built.files, built.model.lastModified);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  a.download = `prism-${built.model.spec.name}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

examples().catch((error) => ($('status').textContent = `The examples could not load: ${error.message}`));
