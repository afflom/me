// The specifications' own examples (corpus.json, made by tools/oracle/gen.py
// from pinned RFCs), for every test that needs content: nothing invented.
//   example(id) is the example as published; titleOf(id) its title; expectOf(id)
//   the reference reading; bodyOf(id) a message's body; toOf(id) its first To address.
import { readFileSync } from "node:fs";

export const { corpus } = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));
const find = (id) => corpus.find((e) => e.id === id) ?? (() => { throw new Error(`the corpus has no ${id}`); })();
export const example = (id) => find(id).raw;
export const expectOf = (id) => find(id).expect;
export const titleOf = (id) => String(find(id).expect.title ?? "").trim();
const split = (raw) => { const at = raw.search(/\r?\n\r?\n/); return [raw.slice(0, at), raw.slice(at).replace(/^\r?\n\r?\n/, "")]; };
export const bodyOf = (id) => split(find(id).raw)[1].replace(/\r\n/g, "\n").trim();
export const toOf = (id) => /^To:.*?<?([^\s<>,]+@[^\s<>,]+)>?/m.exec(split(find(id).raw)[0])?.[1] ?? "";
