// The W3C SCXML 1.0 Implementation Report Plan run against the Prism's statechart
// interpreter. Each test is the IRP's own .txml document, byte for byte as W3C
// serves it (pinned by SHA-256 in app/specs/scxml/spec.json); it passes when the
// document halts in the top-level <final> state the IRP's conformance vocabulary
// names pass (confEcma.xsl: conf:pass).
//
// enforces: w3c-scxml-1.0-355, w3c-scxml-1.0-576, w3c-scxml-1.0-364, w3c-scxml-1.0-375
// enforces: w3c-scxml-1.0-377, w3c-scxml-1.0-387, w3c-scxml-1.0-399, w3c-scxml-1.0-404
// enforces: w3c-scxml-1.0-405, w3c-scxml-1.0-406, w3c-scxml-1.0-412, w3c-scxml-1.0-416
// enforces: w3c-scxml-1.0-417, w3c-scxml-1.0-419, w3c-scxml-1.0-421, w3c-scxml-1.0-144
// enforces: w3c-scxml-1.0-200, w3c-scxml-1.0-220, w3c-scxml-1.0-229, w3c-scxml-1.0-232
// enforces: w3c-scxml-1.0-235, w3c-scxml-1.0-247, w3c-scxml-1.0-189, w3c-scxml-1.0-191
// enforces: w3c-scxml-1.0-192, w3c-scxml-1.0-347, w3c-scxml-1.0-348, w3c-scxml-1.0-495
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GUESTS, openScxml } from '../../site/scxml/guest.mjs';

const root = new URL('../../', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('app/specs/scxml/spec.json', root), 'utf8'));
const run = await openScxml(readFileSync(new URL('site/scxml/' + GUESTS.scxml.path, root)));

test('every IRP test this slice runs is the pinned W3C file, and its marker names it', () => {
  const marked = new Set(readFileSync(new URL(import.meta.url), 'utf8').match(/w3c-scxml-1\.0-\d+/g));
  assert.equal(spec.tests.length, spec.examples.length);
  spec.tests.forEach((t, i) => {
    const sha = createHash('sha256').update(Buffer.from(spec.examples[i][0], 'utf8')).digest('hex');
    assert.equal(sha, t.sha256, `${t.file} is not the pinned bytes`);
    assert.ok(marked.has(`w3c-scxml-1.0-${t.assert}`), `${t.file} is run but not marked`);
  });
});

for (const [i, t] of spec.tests.entries()) {
  test(`IRP ${t.assert} (section ${t.section}): ${t.file}`, async () => {
    assert.equal(await run(spec.examples[i][0]), 'pass');
  });
}
