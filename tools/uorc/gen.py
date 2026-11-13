"""Writes the UORC facet (keyword "uorc") from app/specs/uorc/spec.json.

    python3 -I tools/uorc/gen.py

Outputs, all generated, never hand-edited:
  app/src/PrismUorc.lex.tex        the decision: request line -> answer
  app/src/PrismUorcProofs.lex.tex  one theorem per guarantee
  site/uorc/table.mjs              the same tree in JavaScript, for the page's
                                   preview and the Node suite's cross-check

The judge is a tree whose every test is `field =? value`, at most 11 deep,
so `linear_arithmetic` (simp; split; omega) closes each guarantee with exactly
[Quot.sound, propext]: no compound or negated test reaches omega (no
Classical.choice), and no if-chain reaches Lean's split depth limit of 13.
Every name carries the facet prefix `uorc`, because the holo flattens every
module of app/src into one Rust crate.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/uorc/spec.json").read_text())
P = "uorc"
MOD = "PrismUorc"
REQ = "UorcRequest"
FIELDS = SPEC["fields"]
ANSWERS = SPEC["outcomes"]
NAMES = [f["name"] for f in FIELDS]
VALUES = {f["name"]: f["values"] for f in FIELDS}


def cap(s):
    return s[0].upper() + s[1:]


def hexb(s):
    return "0x" + s.encode().hex()


def vdef(field, value):
    return f"{P}{cap(field)}{cap(value)}"


def adef(answer):
    return f"{P}Answer{cap(answer)}"


MAXLEN = sum(max(len(v) for v in vs) for vs in VALUES.values()) + len(FIELDS) - 1


def tree_depth(t):
    if isinstance(t, str):
        return 0
    return 1 + max(tree_depth(t["then"]), tree_depth(t["else"]))


def lean_tree(t, q=""):
    if isinstance(t, str):
        return f"({q}{adef(t)})"
    f, v = t["if"]
    return (f"(if ((project request {f}) =? ({q}{vdef(f, v)})) then "
            f"{lean_tree(t['then'], q)} else {lean_tree(t['else'], q)})")


def js_tree(t, ind="  "):
    if isinstance(t, str):
        return f"'{t}'"
    f, v = t["if"]
    return f"(r.{f} === '{v}'\n{ind}? {js_tree(t['then'], ind + '  ')}\n{ind}: {js_tree(t['else'], ind + '  ')})"


def module():
    out = []
    w = out.append
    w(r"""\begin{lexlean}{PrismUorc}
\useglossary{lexlean.std.bool@1.2.0}
\useglossary{lexlean.std.nat@1.2.0}
\useglossary{prism.arch@1.0.0}
\importmodule{Foundation.Bytes}
\importmodule{Foundation.View.Text.V1.Model}
\title{Text application model}
\begin{semanticmodule}
""")
    for f in FIELDS:
        for i, v in enumerate(f["values"]):
            w(f"definition{{name: {vdef(f['name'], v)}, parameters: [], result: Nat, body: {i}}}\n\n")
    for i, a in enumerate(ANSWERS):
        w(f"definition{{name: {adef(a)}, parameters: [], result: Nat, body: {i}}}\n\n")
    fields = ",\n".join(f"    {{name: {n}, type: Nat}}" for n in NAMES)
    w(f"structure{{\n  name: {REQ},\n  type_parameters: [],\n  parameters: [],\n  fields: [\n{fields}\n  ]\n}}\n\n")
    w(f"""definition{{
  name: {P}ByteAt,
  parameters: [s : Bytes, i : Nat],
  result: (Option Nat),
  body: (match (prim index s i : (Option UInt8))
    | Option.none => (ctor Option.none [Nat])
    | Option.some b => (ctor Option.some [Nat] (prim to_nat b : Nat))),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: {P}SliceOf,
  parameters: [s : Bytes, start : Nat, count : Nat],
  result: Bytes,
  body: (match (prim slice s start count : (Option Bytes))
    | Option.none => 0x
    | Option.some part => part)
}}

definition{{
  name: {P}FieldEnd,
  parameters: [s : Bytes, i : Nat, fuel : Nat],
  result: Nat,
  body: (match fuel
    | Nat.zero => i
    | Nat.succ rest => (match ({P}ByteAt s i)
      | Option.none => i
      | Option.some d => (if (d =? 32) then i else ({P}FieldEnd s (i + 1) rest)))),
  axioms: [Quot.sound, propext],
  recursive_argument: fuel
}}

""")
    for f in FIELDS:
        n = f["name"]
        body = "(ctor Option.none [Nat])"
        for v in reversed(f["values"]):
            body = f"(if (prim equal value {hexb(v)} : Bool) then (ctor Option.some [Nat] ({vdef(n, v)})) else {body})"
        w(f"definition{{\n  name: {P}Parse{cap(n)},\n  parameters: [value : Bytes],\n  result: (Option Nat),\n  body: {body}\n}}\n\n")
    k = len(FIELDS)
    for i in range(k, 0, -1):
        n = NAMES[i - 1]
        prev = ", ".join(f"v{j} : Nat" for j in range(1, i))
        params = "s : Bytes, start : Nat" + (", " + prev if prev else "")
        if i == k:
            rec = ", ".join(f"{NAMES[j]} := v{j + 1}" for j in range(k))
            cont = (f"(if (e =? (Foundation.Bytes::byteLength s)) then (ctor Option.some [{REQ}] "
                    f"(record {REQ} {{{rec}}})) else (ctor Option.none [{REQ}]))")
        else:
            args = " ".join(f"v{j}" for j in range(1, i + 1))
            cont = (f"(if (e <? (Foundation.Bytes::byteLength s)) then ({P}DecodeField{i + 1} s (e + 1) {args}) "
                    f"else (ctor Option.none [{REQ}]))")
        w(f"""definition{{
  name: {P}DecodeField{i},
  parameters: [{params}],
  result: (Option {REQ}),
  body: (let e : Nat := ({P}FieldEnd s start (Foundation.Bytes::byteLength s)); (match ({P}Parse{cap(n)} ({P}SliceOf s start (prim subtract e start : Nat)))
    | Option.none => (ctor Option.none [{REQ}])
    | Option.some v{i} => {cont})),
  axioms: [Quot.sound, propext]
}}

""")
    w(f"definition{{\n  name: {P}Judge,\n  parameters: [request : {REQ}],\n  result: Nat,\n  body: {lean_tree(SPEC['tree'])}\n}}\n\n")
    enc = "0x696e76616c6964"
    for a in reversed(ANSWERS):
        enc = f"(if (code =? ({adef(a)})) then {hexb(a)} else {enc})"
    w(f"definition{{\n  name: {P}EncodeAnswer,\n  parameters: [code : Nat],\n  result: Bytes,\n  body: {enc}\n}}\n\n")
    w(f"""definition{{
  name: {P}Dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: (if ({MAXLEN} <? (Foundation.Bytes::byteLength value)) then 0x696e76616c6964 else (match ({P}DecodeField1 value 0)
    | Option.none => 0x696e76616c6964
    | Option.some request => ({P}EncodeAnswer ({P}Judge request)))),
  axioms: [Quot.sound, propext]
}}
\\end{{semanticmodule}}
\\end{{lexlean}}
""")
    return "".join(out)


def proofs():
    q = f"{MOD}::"
    defs = sorted([q + vdef(f, v) for f in NAMES for v in VALUES[f]] + [q + adef(a) for a in ANSWERS] + [q + f"{P}Judge"])
    bounds = None
    for n in NAMES:
        term = f"((project request {n}) <? {len(VALUES[n])})"
        bounds = term if bounds is None else f"({bounds} && {term})"
    out = [r"""\begin{lexlean}{PrismUorcProofs}
\useglossary{lexlean.std.bool@1.2.0}
\useglossary{lexlean.std.nat@1.2.0}
\useglossary{prism.arch@1.0.0}
\importmodule{PrismUorc}
\title{Text application model}
\begin{semanticmodule}
"""]
    for i, g in enumerate(SPEC["guarantees"], 1):
        cond = bounds
        for f, v in g["when"]:
            cond = f"({cond} && ((project request {f}) =? ({q}{vdef(f, v)})))"
        judged = [f"(({q}{P}Judge request) =? ({q}{adef(a)}))" for a in (g.get("never") or [])]
        if "always" in g:
            bad = f"(not (({q}{P}Judge request) =? ({q}{adef(g['always'])})))"
        else:
            bad = judged[0]
            for j in judged[1:]:
                bad = f"({bad} || {j})"
        name = f"{P}BreaksInv{i:03}"
        dl = ",\n".join(f"      {d}" for d in defs + [name])
        out.append(f"""definition{{
  name: {name},
  parameters: [request : {q}{REQ}],
  result: Bool,
  body: ({cond} && {bad})
}}

theorem{{
  name: {P}Inv{i:03}Holds,
  parameters: [request : {q}{REQ}],
  statement: (({name} request) = false),
  proof: linear_arithmetic{{
    definitions: [
{dl}
    ]
  }},
  axioms: [Quot.sound, propext]
}}

""")
    out.append("\\end{semanticmodule}\n\\end{lexlean}\n")
    return "".join(out)


def table():
    g = json.dumps([{"id": f"INV-{i:03}", **x} for i, x in enumerate(SPEC["guarantees"], 1)], indent=2)
    return f"""// Generated by tools/uorc/gen.py from app/specs/uorc/spec.json. Do not edit.
// The same decision tree as PrismUorc.lex.tex, for the page's preview and the
// Node suite's cross-check against the compiled guest. The guest decides;
// this mirror only explains.

export const FIELDS = {json.dumps([[n, VALUES[n]] for n in NAMES])};
export const ANSWERS = {json.dumps(ANSWERS)};
export const MAX_LINE = {MAXLEN};
export const GUARANTEES = {g};

export function judge(r) {{
  return {js_tree(SPEC['tree'])};
}}

export function line(r) {{
  return FIELDS.map(([name]) => r[name]).join(' ');
}}
"""


def main():
    d = tree_depth(SPEC["tree"])
    if d > 11:
        sys.exit(f"tree depth {d} > 11: Lean's split gives up at 13")
    (ROOT / "app/src/PrismUorc.lex.tex").write_text(module())
    (ROOT / "app/src/PrismUorcProofs.lex.tex").write_text(proofs())
    (ROOT / "site/uorc").mkdir(exist_ok=True)
    (ROOT / "site/uorc/table.mjs").write_text(table())
    print(f"uorc: {len(FIELDS)} fields, {len(ANSWERS)} answers, {len(SPEC['guarantees'])} guarantees, depth {d}, max line {MAXLEN}")


main()
