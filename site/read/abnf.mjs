// A specification's own grammar, run as written. The rules are data, taken
// from the pinned RFC text by tools/standards/abnf.py (RFC 5234 ABNF); this
// matches text against them with nothing of any one specification in it.
// A rule may match a text in more than one way (ABNF is a context-free
// grammar, not a parsing order), so each rule is recognized as every place it
// can end, then the one derivation that matches the whole text is taken,
// alternatives in the order the specification writes them and repetitions
// longest first. A derivation names the rules it went through, so a reader
// takes what it needs by the specification's own rule names, and a suite can
// say which rules a text exercised.
//   const g = abnf(table); const tree = g.match("orig-date", "Date: ...\r\n");
//   tree = { rule, start, end, text, kids: [trees of named rules] }

export function abnf({ rules }) {
  return {
    match(rule, text) {
      const cps = Array.from(text);
      const run = matcher(rules, cps);
      const tree = run.derive(["ref", rule], 0, cps.length);
      return tree ? tree[0] : null;
    },
    // Every rule a derivation went through, by name.
    rulesOf(tree, out = new Set()) {
      if (!tree) return out;
      out.add(tree.rule);
      for (const kid of tree.kids) this.rulesOf(kid, out);
      return out;
    },
  };
}

// The named rules found under a tree, depth first, as written.
export function all(tree, rule, out = []) {
  if (!tree) return out;
  for (const kid of tree.kids) {
    if (kid.rule === rule) out.push(kid);
    else all(kid, rule, out);
  }
  return out;
}
export const first = (tree, rule) => all(tree, rule)[0] ?? null;

function matcher(rules, cps) {
  const n = cps.length;
  const lower = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
  const codes = cps.map((ch) => ch.codePointAt(0));
  const endsMemo = new Map();
  const deriveMemo = new Map();

  // Every position the node can end at, from pos, most preferred first.
  function ends(node, pos) {
    switch (node[0]) {
      case "ref": {
        const key = `${node[1]}@${pos}`;
        if (endsMemo.has(key)) return endsMemo.get(key);
        endsMemo.set(key, []); // a rule that reaches itself at the same place ends nowhere new there
        const out = ends(rules[node[1]], pos);
        endsMemo.set(key, out);
        return out;
      }
      case "lit": case "cs": {
        const s = Array.from(node[1]);
        if (pos + s.length > n) return [];
        for (let i = 0; i < s.length; i += 1) {
          const want = s[i].codePointAt(0);
          const got = codes[pos + i];
          if (node[0] === "cs" ? got !== want : lower(got) !== lower(want)) return [];
        }
        return [pos + s.length];
      }
      case "range":
        return pos < n && codes[pos] >= node[1] && codes[pos] <= node[2] ? [pos + 1] : [];
      case "prose":
        return [];
      case "alt": {
        const out = [];
        for (const alt of node.slice(1)) for (const e of ends(alt, pos)) if (!out.includes(e)) out.push(e);
        return out;
      }
      case "seq": {
        let at = [pos];
        for (const part of node.slice(1)) {
          const next = [];
          for (const p of at) for (const e of ends(part, p)) if (!next.includes(e)) next.push(e);
          if (!next.length) return [];
          at = next;
        }
        return at;
      }
      case "rep": {
        const [, min, max, inner] = node;
        let frontier = [pos];
        const seen = new Set([pos]);
        const out = min === 0 ? [pos] : [];
        for (let k = 1; frontier.length && (max === null || k <= max); k += 1) {
          const next = [];
          for (const p of frontier) for (const e of ends(inner, p)) if (e > p || k <= min) { if (!next.includes(e)) next.push(e); }
          frontier = next.filter((e) => k < min || !seen.has(e));
          if (k >= min) for (const e of next) if (!out.includes(e)) out.push(e);
          for (const e of next) seen.add(e);
          if (k > min && !frontier.length) break;
        }
        // Longest first.
        return out.sort((a, b) => b - a);
      }
      default:
        throw new Error(`abnf: unknown node ${node[0]}`);
    }
  }

  // The named rules that make node match exactly pos..end, or null.
  function derive(node, pos, end) {
    switch (node[0]) {
      case "ref": {
        const key = `${node[1]}@${pos}-${end}`;
        if (deriveMemo.has(key)) return deriveMemo.get(key);
        deriveMemo.set(key, null);
        if (!ends(node, pos).includes(end)) return null;
        const kids = derive(rules[node[1]], pos, end);
        const out = kids ? [{ rule: node[1], start: pos, end, text: cps.slice(pos, end).join(""), kids }] : null;
        deriveMemo.set(key, out);
        return out;
      }
      case "lit": case "cs": case "range":
        return ends(node, pos).includes(end) ? [] : null;
      case "prose":
        return null;
      case "alt":
        for (const alt of node.slice(1)) { const d = derive(alt, pos, end); if (d) return d; }
        return null;
      case "seq":
        return seq(node.slice(1), pos, end);
      case "rep": {
        const [, min, max, inner] = node;
        return reps(inner, min, max, pos, end, 0);
      }
      default:
        return null;
    }
  }

  function seq(parts, pos, end) {
    if (!parts.length) return pos === end ? [] : null;
    const [head, ...rest] = parts;
    for (const e of ends(head, pos)) {
      if (e > end) continue;
      const d = derive(head, pos, e);
      if (!d) continue;
      const r = seq(rest, e, end);
      if (r) return [...d, ...r];
    }
    return null;
  }

  function reps(inner, min, max, pos, end, k) {
    if (pos === end && k >= min) return [];
    if (max !== null && k >= max) return null;
    for (const e of ends(inner, pos)) {
      if (e > end || (e === pos && k >= min)) continue;
      const d = derive(inner, pos, e);
      if (!d) continue;
      const r = reps(inner, min, max, e, end, k + 1);
      if (r) return [...d, ...r];
    }
    return null;
  }

  return { ends, derive };
}
