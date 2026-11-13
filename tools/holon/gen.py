"""Writes the observer's two facets from their specs:

    python3 -I tools/holon/gen.py [--check]

  app/specs/holon/spec.json  -> keyword "holon":  what the observer does next for one facet
  app/specs/curate/spec.json -> keyword "curate": whether one candidate replaces what a facet runs

Outputs, all generated, never hand-edited:
  app/src/PrismHolon.lex.tex, app/src/PrismHolonProofs.lex.tex
  app/src/PrismCurate.lex.tex, app/src/PrismCurateProofs.lex.tex
  site/holon/table.mjs   both trees in JavaScript, the holon's facets (directive,
                         objective, KPI and floor of each) and the curator's
                         Rule-30 register, objectives and claim form

Each judge is a tree whose every test is `field =? value`, at most 11 deep, so
`linear_arithmetic` closes each guarantee with exactly [Quot.sound, propext].
Every name carries its facet prefix, because the holo flattens every module of
app/src into one Rust crate. --check compares with the files on disk, ignoring
whitespace (lexlean fmt reflows the modules).
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPECS = ROOT / "app/specs"


def cap(s):
    return s[0].upper() + s[1:]


def hexb(s):
    return "0x" + s.encode().hex()


class Facet:
    def __init__(self, spec, prefix, module, request):
        self.spec, self.P, self.MOD, self.REQ = spec, prefix, module, request
        self.fields = spec["fields"]
        self.answers = spec["outcomes"]
        self.names = [f["name"] for f in self.fields]
        self.values = {f["name"]: f["values"] for f in self.fields}
        self.maxlen = sum(max(len(v) for v in vs) for vs in self.values.values()) + len(self.fields) - 1

    def vdef(self, field, value):
        return f"{self.P}{cap(field)}{cap(value)}"

    def adef(self, answer):
        return f"{self.P}Answer{cap(answer)}"

    def depth(self, t=None):
        t = self.spec["tree"] if t is None else t
        return 0 if isinstance(t, str) else 1 + max(self.depth(t["then"]), self.depth(t["else"]))

    def lean_tree(self, t):
        if isinstance(t, str):
            return f"({self.adef(t)})"
        f, v = t["if"]
        return (f"(if ((project request {f}) =? ({self.vdef(f, v)})) then "
                f"{self.lean_tree(t['then'])} else {self.lean_tree(t['else'])})")

    def js_tree(self, t, ind="  "):
        if isinstance(t, str):
            return f"'{t}'"
        f, v = t["if"]
        return f"(r.{f} === '{v}'\n{ind}? {self.js_tree(t['then'], ind + '  ')}\n{ind}: {self.js_tree(t['else'], ind + '  ')})"

    def module(self):
        P, REQ = self.P, self.REQ
        out = []
        w = out.append
        w(rf"""\begin{{lexlean}}{{{self.MOD}}}
\useglossary{{lexlean.std.bool@1.2.0}}
\useglossary{{lexlean.std.nat@1.2.0}}
\useglossary{{prism.arch@1.0.0}}
\importmodule{{Foundation.Bytes}}
\importmodule{{Foundation.View.Text.V1.Model}}
\title{{Text application model}}
\begin{{semanticmodule}}
""")
        for f in self.fields:
            for i, v in enumerate(f["values"]):
                w(f"definition{{name: {self.vdef(f['name'], v)}, parameters: [], result: Nat, body: {i}}}\n\n")
        for i, a in enumerate(self.answers):
            w(f"definition{{name: {self.adef(a)}, parameters: [], result: Nat, body: {i}}}\n\n")
        fields = ",\n".join(f"    {{name: {n}, type: Nat}}" for n in self.names)
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
        for f in self.fields:
            n = f["name"]
            body = "(ctor Option.none [Nat])"
            for v in reversed(f["values"]):
                body = f"(if (prim equal value {hexb(v)} : Bool) then (ctor Option.some [Nat] ({self.vdef(n, v)})) else {body})"
            w(f"definition{{\n  name: {P}Parse{cap(n)},\n  parameters: [value : Bytes],\n  result: (Option Nat),\n  body: {body}\n}}\n\n")
        k = len(self.fields)
        for i in range(k, 0, -1):
            n = self.names[i - 1]
            prev = ", ".join(f"v{j} : Nat" for j in range(1, i))
            params = "s : Bytes, start : Nat" + (", " + prev if prev else "")
            if i == k:
                rec = ", ".join(f"{self.names[j]} := v{j + 1}" for j in range(k))
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
        w(f"definition{{\n  name: {P}Judge,\n  parameters: [request : {REQ}],\n  result: Nat,\n  body: {self.lean_tree(self.spec['tree'])}\n}}\n\n")
        enc = "0x696e76616c6964"
        for a in reversed(self.answers):
            enc = f"(if (code =? ({self.adef(a)})) then {hexb(a)} else {enc})"
        w(f"definition{{\n  name: {P}EncodeAnswer,\n  parameters: [code : Nat],\n  result: Bytes,\n  body: {enc}\n}}\n\n")
        w(f"""definition{{
  name: {P}Dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: (if ({self.maxlen} <? (Foundation.Bytes::byteLength value)) then 0x696e76616c6964 else (match ({P}DecodeField1 value 0)
    | Option.none => 0x696e76616c6964
    | Option.some request => ({P}EncodeAnswer ({P}Judge request)))),
  axioms: [Quot.sound, propext]
}}
\\end{{semanticmodule}}
\\end{{lexlean}}
""")
        return "".join(out)

    def proofs(self):
        P, q = self.P, f"{self.MOD}::"
        defs = sorted([q + self.vdef(f, v) for f in self.names for v in self.values[f]]
                      + [q + self.adef(a) for a in self.answers] + [q + f"{P}Judge"])
        bounds = None
        for n in self.names:
            term = f"((project request {n}) <? {len(self.values[n])})"
            bounds = term if bounds is None else f"({bounds} && {term})"
        out = [rf"""\begin{{lexlean}}{{{self.MOD}Proofs}}
\useglossary{{lexlean.std.bool@1.2.0}}
\useglossary{{lexlean.std.nat@1.2.0}}
\useglossary{{prism.arch@1.0.0}}
\importmodule{{{self.MOD}}}
\title{{Text application model}}
\begin{{semanticmodule}}
"""]
        for i, g in enumerate(self.spec["guarantees"], 1):
            cond = bounds
            for f, v in g["when"]:
                cond = f"({cond} && ((project request {f}) =? ({q}{self.vdef(f, v)})))"
            if "always" in g:
                bad = f"(not (({q}{P}Judge request) =? ({q}{self.adef(g['always'])})))"
            else:
                judged = [f"(({q}{P}Judge request) =? ({q}{self.adef(a)}))" for a in g["never"]]
                bad = judged[0]
                for j in judged[1:]:
                    bad = f"({bad} || {j})"
            name = f"{P}BreaksInv{i:03}"
            dl = ",\n".join(f"      {d}" for d in defs + [name])
            out.append(f"""definition{{
  name: {name},
  parameters: [request : {q}{self.REQ}],
  result: Bool,
  body: ({cond} && {bad})
}}

theorem{{
  name: {P}Inv{i:03}Holds,
  parameters: [request : {q}{self.REQ}],
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

    def js(self, name):
        g = json.dumps([{"id": f"INV-{i:03}", **x} for i, x in enumerate(self.spec["guarantees"], 1)])
        return f"""export const {name} = {{
  fields: {json.dumps([[n, self.values[n]] for n in self.names])},
  answers: {json.dumps(self.answers)},
  maxLine: {self.maxlen},
  guarantees: {g},
  judge(r) {{
    return {self.js_tree(self.spec['tree'], '      ')};
  }},
  line(r) {{
    return this.fields.map(([n]) => r[n]).join(' ');
  }},
}};
"""


def load(name):
    p = SPECS / name / "spec.json"
    return json.loads(p.read_text()) if p.exists() else None


HOLON = Facet(load("holon"), "holon", "PrismHolon", "HolonRequest")
CURATE = Facet(load("curate"), "curate", "PrismCurate", "CurateRequest")


def facets():
    """The holon's facets: each with its directive, objective, KPI, floor and the
    parameters its own spec marks tunable. A place takes its name from the
    surface spec; a facet with a spec takes its directive from that spec."""
    out = []
    for f in HOLON.spec["facets"]:
        spec = load(f["spec"]) if f["spec"] else None
        if f["id"] == "places":
            for p in (spec or {}).get("places", []):
                out.append({"id": p["key"], "kind": "place", "name": p["name"], "floor": f["floor"],
                            "directive": f["directive"].format(name=p["name"]),
                            "objective": f["objective"].format(name=p["name"]),
                            "kpi": f["kpi"].format(name=p["name"]), "tunable": []})
            continue
        base = HOLON.spec["resonanceDefault"] if f["id"] == "resonance" else {}
        out.append({"id": f["id"], "kind": "facet" if f["spec"] else f["id"], "name": (spec or {}).get("title", f["id"]),
                    "floor": f["floor"],
                    "directive": f.get("directive") or (spec or {}).get("purpose") or base["directive"],
                    "objective": f.get("objective") or base.get("objective"),
                    "kpi": f.get("kpi") or base.get("kpi"),
                    "tunable": (spec or {}).get("tunable", [])})
    return out


def table():
    c = CURATE.spec
    return f"""// Generated by tools/holon/gen.py from app/specs/holon/spec.json and
// app/specs/curate/spec.json (with the facet specs they name). Do not edit.
// The same trees as PrismHolon.lex.tex and PrismCurate.lex.tex: the guest
// decides; these mirrors serve the Node suite's cross-check.

{HOLON.js('HOLON')}
{CURATE.js('CURATE')}
export const FACETS = {json.dumps(facets(), indent=1)};
export const BANDS = {json.dumps(HOLON.spec['bands'])};
export const GESTURES = {json.dumps(HOLON.spec['gestures'])};
export const OBJECTIVES = {json.dumps(c['objectives'])};
export const RULE30 = {json.dumps({k: v for k, v in c['rule30'].items() if k in ('cells', 'seed', 'lanes', 'vectors')})};
export const CLAIM = {json.dumps(c['claim'])};
"""


def outputs():
    out = {}
    for f in (HOLON, CURATE):
        d = f.depth()
        if d > 11:
            sys.exit(f"{f.P}: tree depth {d} > 11: Lean's split gives up at 13")
        out[f"app/src/{f.MOD}.lex.tex"] = f.module()
        out[f"app/src/{f.MOD}Proofs.lex.tex"] = f.proofs()
    out["site/holon/table.mjs"] = table()
    return out


def main():
    check = "--check" in sys.argv
    squash = lambda s: "".join(s.split())
    stale = []
    for rel, text in outputs().items():
        p = ROOT / rel
        if check:
            if not p.exists() or squash(p.read_text()) != squash(text):
                stale.append(rel)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
    if stale:
        sys.exit("stale, run python3 -I tools/holon/gen.py: " + ", ".join(stale))
    for f in (HOLON, CURATE):
        print(f"{f.P}: {len(f.fields)} fields, {len(f.answers)} answers, {len(f.spec['guarantees'])} guarantees, depth {f.depth()}, max line {f.maxlen}")
    print(f"facets: {len(facets())}")


main()
