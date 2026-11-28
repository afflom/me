"""The Prism's realizability gate.

    python3 -I tools/realize/gate.py           check, then write the model
    python3 -I tools/realize/gate.py --check   check, and refuse any drift

It reads app/specs/realizability/spec.json, every facet spec named there, and
test/realize/<facet>.txt: what the LexLean program generators/realize answers
over each spec's whole request space (its witness pairs, the rules or leaves
that change an answer, the answers outside the outcomes, the examples, how many
of its words and reasons are given, and which fields read another facet),
and test/realize/descriptor.facts: what that program concludes of each facet
(each reason it is refused, and its eleven elements as have and need).
It refuses the Prism unless:

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
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPECS = ROOT / "app/specs"
SRC = ROOT / "app/src"
MOD = "PrismRealizability"
FACTS = ROOT / "test/realize"
# What the program says of every facet's reads of another facet's outcomes (its rzcomp step).
COMPOSED = (FACTS / "composition.txt").read_text(encoding="utf-8").splitlines() if (FACTS / "composition.txt").exists() else []
ELEMENTS = ["identity", "vocabulary", "capability", "interfaceSpec", "composition", "dynamics",
            "fidelity", "resources", "authority", "evidence", "projection"]


MODEL = json.loads((SPECS / "realizability/spec.json").read_text())
# What the program reads of the root's facet table and of every facet's Lean
# module (its rzproj step): the routes, the request maximum, and per facet the
# deciding module, its theorems, and how it names the spec, or each fault.
DESC = (FACTS / "descriptor.facts").read_text(encoding="utf-8").splitlines() if (FACTS / "descriptor.facts").exists() else []
PROJ = (FACTS / "projection.txt").read_text(encoding="utf-8").splitlines() if (FACTS / "projection.txt").exists() else []
FACETS = [tuple(l.split("\t")[1:]) for l in PROJ if l.startswith("route\t")]


def said(d, word):
    return [l[len(d) + len(word) + 2:] for l in PROJ if l.startswith(f"{d} {word} ")]


class Spec:
    """A facet's decision spec, and what generators/realize answers over its
    whole request space (test/realize/<facet>.txt, held by GN-01)."""

    def __init__(self, d, keyword):
        self.dir, self.keyword, self.module = d, keyword, (said(d, "module") or [None])[0]
        self.raw = json.loads((SPECS / d / "spec.json").read_text(encoding="utf-8"))
        self.fields = self.raw["fields"]
        self.names = [f["name"] for f in self.fields]
        path = FACTS / f"{d}.txt"
        self.facts = path.read_text(encoding="utf-8").splitlines() + COMPOSED if path.exists() else None

    def is_number(self, f):
        return f.get("kind") == "number"

    def told(self, word):
        """The facts of one kind, each split at its tabs."""
        head = f"{self.dir} {word} "
        return [line[len(head):].split("\t") for line in self.facts or [] if line.startswith(head)]

    def point(self, line):
        return tuple(int(v) if self.is_number(f) else v for f, v in zip(self.fields, line.split(" ")))


def load():
    return {d: Spec(d, keyword) for d, keyword in MODEL["facets"].items()}


def cap(word):
    return word[:1].upper() + word[1:]


def projection(s):
    """How the facet's Lean module realizes its spec: the request structure,
    the judge, and the constant of every value and answer, as the program read
    them. Returns (names, faults); names is None when the module does not."""
    faults = said(s.dir, "fault")
    if faults:
        return None, faults
    pair = lambda word: dict(x.rsplit("\t", 1) for x in said(s.dir, word))
    return {"judge": said(s.dir, "judge")[0], "struct": said(s.dir, "struct")[0], "fields": dict(x.split(" ") for x in said(s.dir, "field")),
            "values": {tuple(k.split("\t")): c for k, c in pair("value").items()}, "answers": pair("answer")}, []


def audit():
    """Every finding, and the descriptor and witnesses of every facet."""
    specs = load()
    fail = []
    out = {}
    routed = [k for k, _ in FACETS]
    for k in routed:
        if k not in MODEL["facets"].values() and k not in MODEL.get("unspecified", {}):
            fail.append(f"facet `{k}` is routed by the root but has no spec in app/specs/realizability/spec.json")
    for d in sorted(p.parent.name for p in SPECS.glob("*/spec.json")):
        decides = "outcomes" in json.loads((SPECS / d / "spec.json").read_text())
        if d not in specs and decides:
            fail.append(f"app/specs/{d} is not named in app/specs/realizability/spec.json")
    if not DESC:
        fail.append("test/realize/descriptor.facts is missing: run tools/generators/run.sh")
    for d, s in specs.items():
        # What the program says of the facet (its rzdesc step): each reason it
        # is refused, in words, then its requests, the digest of its spec as
        # staged, and its eleven elements as have and need.
        says = lambda word: [l[len(d) + len(word) + 2:] for l in DESC if l.startswith(f"{d} {word} ")]
        fail += [f"{d}: {m}" for m in says("fail")]
        if DESC and not says("fail") and not says("points"):
            fail.append(f"{d}: test/realize/descriptor.facts says nothing of it: run tools/generators/run.sh")
        if not says("points"):
            continue
        desc = {e: (int(have), int(need)) for e, have, need in (x.split(" ") for x in says("element"))}
        found = {name: (s.point(x), s.point(y), a, b) for name, x, y, a, b in s.told("witness")}
        witnesses = [(f["name"], found[f["name"]]) for f in s.fields if f["name"] in found]
        names, _ = projection(s)
        out[d] = {"spec": s, "desc": desc, "digest": says("digest")[0], "witnesses": witnesses, "points": int(says("points")[0]), "names": names}
    # Settings: generators/realize answers them from the surface, the coherence
    # registry and this model (test/realize/settings.txt, held by GN-01): how
    # many settings drive a sensitive field of every facet the registry has
    # them drive, each flaw in words, and which the person sees (PD-03).
    path = FACTS / "settings.txt"
    if not path.exists():
        return fail + ["test/realize/settings.txt is missing: run tools/generators/run.sh"], out, (0, 0, [])
    told = {w: [l[len(w) + 10:] for l in path.read_text(encoding="utf-8").splitlines() if l.startswith(f"settings {w} ")] for w in ("bound", "seen", "flaw")}
    bound, _, count = told["bound"][0].split(" ")
    return fail + told["flaw"], out, (int(bound), int(count), told["seen"])


def camel(d):
    return "".join(p.capitalize() for p in re.split(r"[-_]", d))


def lean(out, settings):
    parts = []
    w = parts.append
    w("\\begin{lexlean}{%s}\n\\useglossary{lexlean.std.bool@1.2.0}\n\\useglossary{lexlean.std.nat@1.2.0}\n\\useglossary{prism.arch@1.0.0}\n\\title{Text application model}\n\\begin{semanticmodule}\n" % MOD)
    # lexlean fmt's canonical form keeps a short field list on one line (LLL1003).
    w("structure{\n  name: RealizabilityElement,\n  type_parameters: [],\n  parameters: [],\n  fields: [{name: have, type: Nat}, {name: need, type: Nat}]\n}\n\n")
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
                lean = names["fields"][f["name"]]
                parts.append(f"{lean} := {v}" if s.is_number(f) else f"{lean} := ({m}::{names['values'][(f['name'], v)]})")
            return "(record %s::%s {%s})" % (m, names["struct"], ", ".join(parts))

        for field, (x, y, a, b) in r["witnesses"]:
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
