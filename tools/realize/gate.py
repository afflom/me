"""The Prism's realizability gate.

    python3 -I tools/realize/gate.py           check, then write the model
    python3 -I tools/realize/gate.py --check   check, and refuse any drift

It reads app/specs/realizability/spec.json and every facet spec named there,
and refuses the Prism unless:

  sensitivity  every field of every spec changes some answer: there is a
               pair of requests that differ in that field alone and get
               different answers (a witness pair)
  liveness     every rule decides some request no other rule would decide
               the same way, and every tree leaf is reached; an `otherwise`
               may go unreached only when the rules already cover every
               request (it is then the judge's totality, not a stub)
  totality     every request the fields allow gets one of the outcomes
  closure      every example the spec gives is answered as it says, and the
               facet's Lean judge, the one the holo is compiled from, gives
               each witness pair the spec's two answers, by reflexivity in the
               kernel (the spec's answer and the runtime's answer are one)
  settings     every setting of the surface drives a sensitive field of each
               facet the coherence registry has it drive, and of no other
  descriptor   every facet carries its eleven elements (identity, vocabulary,
               capability, interface, composition, dynamics, fidelity,
               resources, authority, evidence, projection), each complete

It writes app/src/PrismRealizability.lex.tex (one descriptor per facet) and
PrismRealizabilityProofs.lex.tex (every descriptor is complete, and every
witness pair is answered by the facet's judge as the spec says, each by
reflexivity); then run `(cd app && lexlean fmt && lexlean lock)`.
"""
import ast
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from spec_eval import Spec  # noqa: E402

SPECS = ROOT / "app/specs"
SRC = ROOT / "app/src"
MOD = "PrismRealizability"
ELEMENTS = ["identity", "vocabulary", "capability", "interfaceSpec", "composition", "dynamics",
            "fidelity", "resources", "authority", "evidence", "projection"]


def root_facets():
    """(keyword, module) of every facet the application root routes, and its
    request maximum, read from tools/prism_root.py without running it."""
    tree = ast.parse((ROOT / "tools/prism_root.py").read_text())
    facets, req_max = None, None
    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
            if "FACETS" in names:
                facets = ast.literal_eval(node.value)
            if any(isinstance(t, ast.Tuple) for t in node.targets):
                t = node.targets[0]
                if [e.id for e in t.elts][:1] == ["REQ_MAX"]:
                    req_max = ast.literal_eval(node.value.elts[0])
    return [(k, m) for k, m, _ in facets], req_max


MODEL = json.loads((SPECS / "realizability/spec.json").read_text())
FACETS, REQ_MAX = root_facets()
KEYWORD_MODULE = dict(FACETS)


def load():
    out = {}
    for d, keyword in MODEL["facets"].items():
        out[d] = Spec(str(SPECS / d / "spec.json"))
        out[d].dir, out[d].keyword, out[d].module = d, keyword, KEYWORD_MODULE.get(keyword)
    return out


def flip(x, i, v):
    return x[:i] + (v,) + x[i + 1:]


def witness(s, i, points):
    """The first pair of requests that differ in field i alone and get
    different answers, searching from the spec's own examples first."""
    dom = s.domain(s.fields[i])
    starts = [x for x in (s.parse(q) for q, _ in s.examples()) if x is not None]
    for x in starts + points:
        a = s.answer(x)
        for v in dom:
            if v != x[i]:
                y = flip(x, i, v)
                if s.answer(y) != a:
                    return x, y
    return None


def live_rules(s, points):
    """The rules (or leaves) that change some answer, and the unreached
    branches. A rule changes an answer when removing it would."""
    hit = {s.decide(x)[1] for x in points}
    if s.shape == "tree":
        leaves = s.branches()
        return [b for b in leaves if b in hit], [b for b in leaves if b not in hit]
    base = [s.answer(x) for x in points]
    rules = s.raw["rules"]
    live = []
    for k, r in enumerate(rules):
        s.raw["rules"] = rules[:k] + rules[k + 1:]
        if [s.answer(x) for x in points] != base:
            live.append(r["id"])
        s.raw["rules"] = rules
    # An unreached `otherwise` is left alone: the rules then cover every
    # request, and it is the judge's totality, never a stub.
    return live, [r["id"] for r in rules if r["id"] not in live]


def coherence_facets():
    """The coherence registry's facets, through tools/specs/record.py when it
    is there (it assembles the per-facet files), else inline."""
    path = SPECS / "coherence/spec.json"
    record = ROOT / "tools/specs/record.py"
    if record.exists():
        import importlib.util
        spec = importlib.util.spec_from_file_location("record", record)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.load(str(path))["facets"]
    return json.loads(path.read_text())["facets"]


def theorem_count(module):
    p = SRC / f"{module}Proofs.lex.tex"
    return len(re.findall(r"^theorem\{", p.read_text(), re.M)) if p.exists() else 0


def cap(word):
    return word[:1].upper() + word[1:]


def projection(s):
    """How the facet's Lean module realizes its spec: the request structure,
    the judge, and the constant of every value and answer. Returns
    (names, faults); names is None when the module does not realize it."""
    text = (SRC / f"{s.module}.lex.tex").read_text()
    faults = []
    judge = re.search(r"name: (\w+)Judge,\s*parameters: \[request : (\w+)\]", text)
    if not judge:
        return None, [f"{s.module} has no judge of one request"]
    prefix, struct = judge.group(1), judge.group(2)
    body = re.search(r"name: %s,\s*type_parameters: \[\],\s*parameters: \[\],\s*fields: \[(.*?)\]\s*\}" % struct, text, re.S)
    lean_fields = re.findall(r"\{name: (\w+), type: Nat\}", body.group(1)) if body else []
    if lean_fields != s.names:
        faults.append(f"{s.module}::{struct} has fields {lean_fields}, the spec {s.names}")
    consts = {m.group(1): int(m.group(2)) for m in re.finditer(r"name: (\w+), parameters: \[\], result: Nat, body: (\d+)\}", text)}
    values = {}
    for f in s.fields:
        if s.is_number(f):
            continue
        for k, v in enumerate(f["values"]):
            name = f"{prefix}{cap(f['name'])}{cap(v)}"
            if consts.get(name) != k:
                faults.append(f"{s.module}::{name} is not value {k} of field {f['name']}")
            values[(f["name"], v)] = name
    answers = {}
    for k, o in enumerate(s.outcomes):
        name = f"{prefix}Answer{cap(o)}"
        if consts.get(name) != k:
            faults.append(f"{s.module}::{name} is not answer {k}")
        answers[o] = name
    names = {"judge": f"{prefix}Judge", "struct": struct, "values": values, "answers": answers}
    return (None if faults else names), faults


def audit():
    """Every finding, and the descriptor and witnesses of every facet."""
    specs = load()
    fail = []
    out = {}
    outcome_sets = {d: set(s.outcomes) for d, s in specs.items()}
    routed = [k for k, _ in FACETS]
    for k in routed:
        if k not in MODEL["facets"].values() and k not in MODEL.get("unspecified", {}):
            fail.append(f"facet `{k}` is routed by the root but has no spec in app/specs/realizability/spec.json")
    for d in sorted(p.parent.name for p in SPECS.glob("*/spec.json")):
        decides = "outcomes" in json.loads((SPECS / d / "spec.json").read_text())
        if d not in specs and decides:
            fail.append(f"app/specs/{d} is not named in app/specs/realizability/spec.json")
    for d, s in specs.items():
        where = f"{d}"
        if s.module is None:
            fail.append(f"{where}: keyword `{s.keyword}` is not routed by tools/prism_root.py")
            continue
        points = list(s.space())
        answers = [s.answer(x) for x in points]
        total = sum(1 for a in answers if a in s.outcomes)
        if total != len(points):
            bad = next(x for x, a in zip(points, answers) if a not in s.outcomes)
            fail.append(f"{where}: `{s.line(bad)}` answers {s.answer(bad)!r}, not an outcome")
        reached = [o for o in s.outcomes if o in set(answers)]
        for o in s.outcomes:
            if o not in reached:
                fail.append(f"{where}: outcome `{o}` is never answered")
        witnesses = []
        for i, f in enumerate(s.fields):
            w = witness(s, i, points)
            if w is None:
                fail.append(f"{where}: field `{f['name']}` changes no answer")
            else:
                witnesses.append((f["name"], w))
        live, dead = live_rules(s, points)
        for b in dead:
            fail.append(f"{where}: {'rule' if s.shape == 'rules' else 'leaf'} {b} changes no answer")
        branches = len(s.raw["rules"]) if s.shape == "rules" else len(s.branches())
        # A spec with `read` derives its fields from the request (kappa reads
        # them from the label), so its examples are not field lines: the
        # root's acceptance vectors replay them in the guest instead.
        lines = not s.raw.get("read")
        valid = [(q, r) for q, r in s.examples() if lines and s.parse(q) is not None]
        agree = [(q, r) for q, r in valid if s.answer(s.parse(q)) == r]
        for q, r in valid:
            if (q, r) not in agree:
                fail.append(f"{where}: example `{q}` says {r!r}, the spec answers {s.answer(s.parse(q))!r}")
        for q, r in s.examples():
            if lines and s.parse(q) is None and r != "invalid":
                fail.append(f"{where}: example `{q}` is not a request of this spec, yet says {r!r}")
        meanings = s.raw.get("meanings", {})
        means = sum(1 for f in s.fields if f.get("means")) + sum(1 for o in s.outcomes if meanings.get(o))
        reads = MODEL.get("reads", {}).get(d, {})
        composed_need, composed_have = 0, 0
        for f in s.fields:
            if s.is_number(f):
                continue
            others = [o for o, outs in outcome_sets.items() if o != d and set(f["values"]) == outs]
            declared = reads.get(f["name"])
            if others or declared:
                composed_need += 1
                if declared in others:
                    composed_have += 1
                elif declared:
                    fail.append(f"{where}: field `{f['name']}` reads {declared}, but its values are not {declared}'s outcomes")
                else:
                    fail.append(f"{where}: field `{f['name']}` takes {others[0]}'s outcomes; name it under reads.{d}")
        guards = s.raw.get("properties", s.raw.get("guarantees", []))
        rules = s.raw.get("rules", [])
        why_need = len(rules) + len(guards)
        why_have = sum(1 for r in rules if r.get("why")) + sum(1 for g in guards if g.get("why"))
        if s.shape == "tree":
            why_need += 1
            why_have += 1 if s.raw.get("purpose") else 0
        else:
            why_need += 1
            why_have += 1 if s.raw.get("otherwiseWhy") else 0
        longest = max(len(f"{s.keyword} {s.line(x)}".encode()) for x in points)
        names, faults = projection(s)
        fail += [f"{where}: {m}" for m in faults]
        projected = len(witnesses) if names else 0
        facet_code = routed.index(s.keyword) + 1
        digest = hashlib.sha256((SPECS / d / "spec.json").read_bytes()).hexdigest()
        desc = {
            "identity": (facet_code, 1),
            "vocabulary": (means, len(s.fields) + len(s.outcomes)),
            "capability": (len(reached), len(s.outcomes)),
            "interfaceSpec": (len(witnesses), len(s.fields)),
            "composition": (composed_have, composed_need),
            "dynamics": (len(live), branches),
            "fidelity": (len(agree), len(valid)),
            "resources": (REQ_MAX, longest),
            "authority": (why_have, why_need),
            "evidence": (theorem_count(s.module), len(guards)),
            "projection": (projected, len(s.fields)),
        }
        for e in ("vocabulary", "authority"):
            have, need = desc[e]
            if have < need:
                fail.append(f"{where}: {e} has {have} of {need}")
        if desc["evidence"][0] < desc["evidence"][1]:
            fail.append(f"{where}: {s.module}Proofs proves {desc['evidence'][0]} theorems for {desc['evidence'][1]} guarantees")
        if longest > REQ_MAX:
            fail.append(f"{where}: a request of {longest} bytes exceeds the root's maximum {REQ_MAX}")
        out[d] = {"spec": s, "desc": desc, "digest": digest, "witnesses": witnesses, "points": len(points), "names": names}
    # Settings: the coherence registry says which facets a setting drives;
    # this model says which of their fields. Every field bound must be a
    # sensitive field of a facet the registry has the setting drive, and
    # every facet the registry has it drive must have a field bound.
    surface = json.loads((SPECS / "surface/spec.json").read_text())
    keys = [x["key"] for x in surface["settings"]]
    bindings = MODEL.get("settings", {})
    dir_of = {kw: d for d, kw in MODEL["facets"].items()}
    registry = {}
    for f in coherence_facets():
        for k in f.get("drives", {}).get("settings", []):
            registry.setdefault(k, set()).add(f.get("line", f["key"]))
    bound = 0
    for k in keys:
        drives = bindings.get(k, [])
        ok = True
        for d, field in drives:
            if d not in out or field not in [n for n, _ in out[d]["witnesses"]]:
                fail.append(f"setting `{k}` drives {d}.{field}, which is not a sensitive field of a facet")
                ok = False
            elif MODEL["facets"][d] not in registry.get(k, set()):
                fail.append(f"setting `{k}` binds {d}.{field}, but the coherence registry does not have `{MODEL['facets'][d]}` drive `{k}`")
                ok = False
        for kw in sorted(registry.get(k, set())):
            d = dir_of.get(kw)
            if not any(b == d for b, _ in drives):
                fail.append(f"the coherence registry has `{kw}` drive setting `{k}`, but no field of it is bound under settings.{k}")
                ok = False
        if not drives:
            fail.append(f"setting `{k}` drives no field of any facet")
        elif ok:
            bound += 1
    for k in bindings:
        if k not in keys:
            fail.append(f"settings.{k} is not a setting of the surface")
    # The person's view is the page: say which proven settings it draws,
    # so "proven" never reads as "what the person handles" (PD-03).
    seen = [x["name"] for x in surface["settings"] if x.get("viewpoint") == "person"]
    return fail, out, (bound, len(keys), seen)


def camel(d):
    return "".join(p.capitalize() for p in re.split(r"[-_]", d))


def lean(out, settings):
    parts = []
    w = parts.append
    w("\\begin{lexlean}{%s}\n\\useglossary{lexlean.std.bool@1.2.0}\n\\useglossary{lexlean.std.nat@1.2.0}\n\\useglossary{prism.arch@1.0.0}\n\\title{Text application model}\n\\begin{semanticmodule}\n" % MOD)
    w("structure{\n  name: RealizabilityElement,\n  type_parameters: [],\n  parameters: [],\n  fields: [\n    {name: have, type: Nat},\n    {name: need, type: Nat}\n  ]\n}\n\n")
    fields = ",\n".join(["    {name: facet, type: Nat}", "    {name: digest, type: Nat}"] + [f"    {{name: {e}, type: RealizabilityElement}}" for e in ELEMENTS])
    w("structure{\n  name: RealizabilityDescriptor,\n  type_parameters: [],\n  parameters: [],\n  fields: [\n%s\n  ]\n}\n\n" % fields)
    w("definition{name: realizabilityElementCount, parameters: [], result: Nat, body: %d}\n\n" % len(ELEMENTS))
    w("definition{\n  name: realizabilityElementComplete,\n  parameters: [e : RealizabilityElement],\n  result: Bool,\n  body: ((project e need) <=? (project e have))\n}\n\n")
    conj = "(1 <=? (project d facet))"
    for e in ELEMENTS:
        conj = f"({conj} && (realizabilityElementComplete (project d {e})))"
    w("definition{\n  name: realizabilityDescriptorComplete,\n  parameters: [d : RealizabilityDescriptor],\n  result: Bool,\n  body: %s\n}\n\n" % conj)
    for d, r in out.items():
        elems = ", ".join(f"{e} := (record RealizabilityElement {{have := {r['desc'][e][0]}, need := {r['desc'][e][1]}}})" for e in ELEMENTS)
        w("definition{\n  name: realizability%s,\n  parameters: [],\n  result: RealizabilityDescriptor,\n  body: (record RealizabilityDescriptor {facet := %d, digest := %d, %s})\n}\n\n"
          % (camel(d), r["desc"]["identity"][0], int(r["digest"][:8], 16), elems))
    w("definition{name: realizabilitySettingsBound, parameters: [], result: Nat, body: %d}\n\n" % settings[0])
    w("definition{name: realizabilitySettingsCount, parameters: [], result: Nat, body: %d}\n" % settings[1])
    w("\\end{semanticmodule}\n\\end{lexlean}\n")
    model = "".join(parts)
    p = []
    imports = "".join("\\importmodule{%s}\n" % m for m in sorted({MOD} | {r["spec"].module for r in out.values()}))
    p.append("\\begin{lexlean}{%sProofs}\n\\useglossary{lexlean.std.bool@1.2.0}\n\\useglossary{lexlean.std.nat@1.2.0}\n\\useglossary{prism.arch@1.0.0}\n%s\\title{Text application model}\n\\begin{semanticmodule}\n" % (MOD, imports))
    for d in out:
        p.append("theorem{\n  name: realizability%sComplete,\n  parameters: [],\n  statement: ((%s::realizabilityDescriptorComplete (%s::realizability%s)) = true),\n  proof: reflexivity{},\n  axioms: []\n}\n\n" % (camel(d), MOD, MOD, camel(d)))
    for d, r in out.items():
        s, names = r["spec"], r["names"]
        m = s.module
        if names is None:
            continue

        def term(x):
            parts = []
            for f, v in zip(s.fields, x):
                parts.append(f"{f['name']} := {v}" if s.is_number(f) else f"{f['name']} := ({m}::{names['values'][(f['name'], v)]})")
            return "(record %s::%s {%s})" % (m, names["struct"], ", ".join(parts))

        for field, (x, y) in r["witnesses"]:
            a, b = s.answer(x), s.answer(y)
            p.append("theorem{\n  name: realizability%s%sMatters,\n  parameters: [],\n  statement: ((((%s::%s %s) =? (%s::%s)) && ((%s::%s %s) =? (%s::%s))) = true),\n  proof: reflexivity{},\n  axioms: []\n}\n\n"
                     % (camel(d), cap(field), m, names["judge"], term(x), m, names["answers"][a], m, names["judge"], term(y), m, names["answers"][b]))
    p.append("theorem{\n  name: realizabilityEverySettingBound,\n  parameters: [],\n  statement: (((%s::realizabilitySettingsCount) <=? (%s::realizabilitySettingsBound)) = true),\n  proof: reflexivity{},\n  axioms: []\n}\n" % (MOD, MOD))
    p.append("\\end{semanticmodule}\n\\end{lexlean}\n")
    return model, "".join(p)


def squash(text):
    return re.sub(r"\s+", "", text)


def main():
    check = "--check" in sys.argv[1:]
    fail, out, settings = audit()
    for d, r in out.items():
        incomplete = [e for e in ELEMENTS if r["desc"][e][1] > r["desc"][e][0]]
        for e in incomplete:
            have, need = r["desc"][e]
            msg = f"{d}: descriptor element {e} is incomplete ({have} of {need})"
            if msg not in fail and not any(m.startswith(f"{d}: {e} ") for m in fail):
                fail.append(msg)
    model, proofs = lean(out, settings)
    targets = {SRC / f"{MOD}.lex.tex": model, SRC / f"{MOD}Proofs.lex.tex": proofs}
    if check:
        for path, text in targets.items():
            if not path.exists() or squash(path.read_text()) != squash(text):
                fail.append(f"{path.relative_to(ROOT)} is not what app/specs says: run python3 -I tools/realize/gate.py")
    if fail:
        for m in fail:
            print(f"realizability: {m}", file=sys.stderr)
        sys.exit(1)
    if not check:
        for path, text in targets.items():
            path.write_text(text)
    n = sum(len(r["spec"].fields) for r in out.values())
    print(f"realizability: {len(out)} facets, {n} fields each change an answer, {settings[0]} of {settings[1]} settings drive one (the person sees {len(settings[2])}: {', '.join(settings[2])}), 11 of 11 elements complete")


if __name__ == "__main__":
    main()
