// A specification's own grammar, run as written. The rules are data, taken
// from the pinned RFC text by tools/standards/abnf.py (RFC 5234 ABNF), and the
// Prism matches text against them in LexLean: app/src/Abnf.lex.tex walks the
// rules as the byte table tools/standards/grammar.py writes into
// app/src/PrismGrammarMail.lex.tex and PrismGrammarIcal.lex.tex, built as the grammar-mail and grammar-ical guests and
// pinned in ./guest.mjs (GU-01), whose loader checks and compiles it once, when
// this module loads; each match then runs it synchronously, so a reader stays
// synchronous. Chromium instantiates a module this small on the main thread
// (its limit is 8 MB).
// A rule may match a text in more than one way (ABNF is a context-free
// grammar, not a parsing order), so each rule is recognized as every place it
// can end, then the one derivation that matches the whole text is taken,
// alternatives in the order the specification writes them and repetitions
// longest first. The guest answers "none", or each rule it went through as
// "rule,start,end,depth" in UTF-8 octets, in order; that is the tree here.
//   const g = abnf(table); const tree = g.match("orig-date", "Date: ...\r\n");
//   tree = { rule, start, end, text, kids: [trees of named rules] }
import { GUESTS, opened } from "./guest.mjs";
import { GUEST as ICAL, opened as openedIcal } from "../calendar/guest.mjs";

const encoder = new TextEncoder();
// Each grammar's guest, by the grammar's key: checked and compiled once, here.
const asks = { mail: await opened(GUESTS.mail), ical: await openedIcal(ICAL), rfc3339: await import("../rfc3339/guest.mjs").then((m) => m.opened(m.GUEST)) };

export function abnf({ rules, key }) {
  const names = Object.keys(rules).sort();
  const index = new Map(names.map((n, i) => [n, i]));
  return {
    match(rule, text) {
      // A text beyond what the guest can hold (it traps) is not read, like one beyond its request limit ("invalid").
      let answer = "none";
      try { if (index.has(rule)) answer = asks[key](`${index.get(rule)} ${text}`); } catch { return null; }
      if (answer === "none" || answer === "invalid") return null;
      const cps = Array.from(text);
      const at = new Map([[0, 0]]);
      cps.reduce((o, c, i) => (at.set(o + encoder.encode(c).length, i + 1), o + encoder.encode(c).length), 0);
      const open = [];
      for (const span of answer.split(" ")) {
        const [r, s, e, d] = span.split(",").map(Number);
        const node = { rule: names[r], start: at.get(s), end: at.get(e), kids: [] };
        node.text = cps.slice(node.start, node.end).join("");
        open.length = d;
        if (d) open[d - 1].kids.push(node);
        open.push(node);
      }
      return open[0];
    },
    // Every rule a derivation went through, by name.
    rulesOf(tree, out = new Set()) {
      for (const kid of tree ? (out.add(tree.rule), tree.kids) : []) this.rulesOf(kid, out);
      return out;
    },
    // How a list rule's members keep to the occurrence its specification gives each (the ical guest; app/src/PrismIcal.lex.tex):
    // nothing, or a line per breach, "R1 uid 2" (required once), "O1 class 2" (optional, at most once), "S1 rrule 2" (should be at most once).
    counts: (rule, members) => asks[key](`counts\n${rule}\n${members.map((member) => member + "\n").join("")}`).split("\n").filter((line) => line && line !== "ok"),
  };
}

// The named rules found under a tree, depth first, as written.
export function all(tree, rule, out = []) {
  for (const kid of tree?.kids ?? []) kid.rule === rule ? out.push(kid) : all(kid, rule, out);
  return out;
}
export const first = (tree, rule) => all(tree, rule)[0] ?? null;
