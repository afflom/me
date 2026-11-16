// The whole-person model: WHO's International Classification of Functioning,
// Disability and Health (ICF), every entity of the release pinned in
// app/specs/oracle/spec.json, with its code, title and URI as WHO publishes it.
// International Classification of Functioning, Disability and Health (ICF), World Health Organization (WHO) 2001. Licensed under the Creative Commons Attribution-NoDerivatives 3.0 IGO licence (CC BY-ND 3.0 IGO).
// Written by generators/person/src/GenIcfModule.lex.tex from the oracle's pin; the
// entities are generators/person/src/GenIcf.lex.tex's rows. Do not edit.

import { ROWS, VERSION } from "./icf-rows.mjs";

export const RELEASE = Object.freeze({
  title: "WHO International Classification of Functioning, Disability and Health (ICF), release 2026-01, simple tabulation",
  release: "2026-01",
  version: VERSION,
  url: "https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICF-en.zip",
  sha256: "38776b09204984dcf1ce3d00f5cf25238abd4cfe37a9929c8799d11f101652d5",
  browser: "https://icd.who.int/browse/2026-01/icf/en",
  licence: "Creative Commons Attribution-NoDerivatives 3.0 IGO (CC BY-ND 3.0 IGO)",
  licenceUrl: "https://creativecommons.org/licenses/by-nd/3.0/igo/",
  terms: "https://icd.who.int/en/docs/ICD11-license.pdf",
  citation: "International Classification of Functioning, Disability and Health (ICF), World Health Organization (WHO) 2001. Licensed under the Creative Commons Attribution-NoDerivatives 3.0 IGO licence (CC BY-ND 3.0 IGO)",
  foundation: "http://id.who.int/icd/entity/",
  linearization: "http://id.who.int/icd/release/11/icf/",
  counts: Object.freeze(Object.fromEntries(["chapter", "block", "category"].map((k) => [k, ROWS.filter((r) => r[6] === k).length]))),
});

// Each entity, in the release's order, as generators/person/src/GenIcf.lex.tex
// writes it from the release's tabulation (app/specs/oracle/icf): foundation id
// (none for a residual category, which is only in the linearization), linearization
// id, code, block id, title, level, kind, depth in kind, residual, leaf, parent's
// foundation id (none for a root), coding note.
export const FIELDS = Object.freeze(["id", "linear", "code", "block", "title", "level", "kind", "depth", "residual", "leaf", "parent", "note"]);

// The Prism's own functions over the entities follow (not WHO's: ICF terms 1.2.5).
const INDEX = new Map(ROWS.flatMap(([id], i) => (id ? [[id, i]] : [])));
const entity = (i) => {
  const [id, linear, code, block, title, level, kind, depth, residual, leaf, parent, note] = ROWS[i];
  return Object.freeze({ index: i, uri: id ? RELEASE.foundation + id : null, release: RELEASE.linearization + linear, code, block, title, level, kind, depth, residual, leaf, parent: parent === null ? -1 : INDEX.get(parent), note });
};
export const ENTITIES = Object.freeze(ROWS.map((_, i) => entity(i)));
const BY_CODE = new Map(ENTITIES.filter((e) => e.code).map((e) => [e.code, e]));
const BY_URI = new Map(ENTITIES.flatMap((e) => (e.uri ? [[e.uri, e], [e.release, e]] : [[e.release, e]])));
// The entity a code, or its foundation or linearization URI, names, or null.
export const byCode = (code) => BY_CODE.get(code) ?? null;
export const byUri = (uri) => BY_URI.get(uri) ?? null;
// The entities above one, nearest first.
export function ancestors(e) {
  const out = [];
  for (let p = e.parent; p >= 0; p = ENTITIES[p].parent) out.push(ENTITIES[p]);
  return out;
}
export const childrenOf = (e) => ENTITIES.filter((c) => c.parent === e.index);
// The classification's categories (coded, not qualifiers) and its qualifier scales.
export const CATEGORIES = Object.freeze(ENTITIES.filter((e) => e.kind === "category" && !e.code.startsWith("q")));
export const QUALIFIERS = Object.freeze(ENTITIES.filter((e) => e.kind === "category" && e.code.startsWith("q")));
// Its four components (the first-level blocks under the ICF categories) and their chapters (the second level).
export const COMPONENTS = Object.freeze(ENTITIES.filter((e) => e.parent >= 0 && ENTITIES[e.parent].parent < 0 && ENTITIES[e.parent].title === "ICF Category"));
export const CHAPTERS = Object.freeze(ENTITIES.filter((e) => e.parent >= 0 && COMPONENTS.includes(ENTITIES[e.parent])));
// The component and the chapter an entity is in, or null for a root or a qualifier.
export const componentOf = (e) => [e, ...ancestors(e)].find((a) => COMPONENTS.includes(a)) ?? null;
export const chapterOf = (e) => [e, ...ancestors(e)].find((a) => CHAPTERS.includes(a)) ?? null;
// The facets of the whole person that what arrives is filed under: the
// classification's second-level categories (a component letter and three
// digits), each read by meaning as its title in its chapter's words.
export const FACETS = Object.freeze(CATEGORIES.filter((e) => e.code.length === 4));
export const facetText = (e) => `${e.title} (${chapterOf(e).title})`;
// The facets nearest a meaning vector, nearest first: at most `most`, each at
// least `near`, given the facets' own vectors in FACETS order.
export function nearestFacets(vector, vectors, { near, most = 3, nearness }) {
  if (!vector || !vectors) return [];
  return vectors.map((v, i) => [nearness(vector, v), i]).filter(([c]) => c >= near).sort((a, b) => b[0] - a[0]).slice(0, most).map(([, i]) => FACETS[i].code);
}
