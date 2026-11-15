"""SY-01: the Prism as one system, written from app/specs/system/spec.json.

    python3 -I tools/system/gen.py [--check]

Writes app/src/PrismSystem.lex.tex: the top of the architecture description (ISO/IEC/IEEE
42010: the person as stakeholder, the concern the system answers, its viewpoint, view and
components) and the OPM system diagram (ISO 19450: the main process, the person as agent
and the two states of the attribute it changes, the browser as instrument, the streams it
consumes, the content it holds) with its zoom into the parts, each part into the Decide
process of every decision it holds. Facet records join one system model across modules and
take canonical indexes after Architecture's, in name order (prismpm check, PP4004), and the
SDK reads only record literals (PP2012), so the records are written out here.

Refused: a decision of app/prompts/set.json that is not exactly one part's; a part that
holds no decision and owes nothing, or holds one and still owes; owed parts beyond
owedAtMost (it only shrinks, by a change to this file); a standard missing from the
standards register (app/specs/standards/spec.json). --check also refuses a stale module.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "app/src/PrismSystem.lex.tex"
REGISTER = ROOT / "app/specs/standards/spec.json"
OWED_AT_MOST = {"Me", "Synchronisation"}
A, M = "Foundation.Arch", "PrismSystem::"


def pascal(s):
    return "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]+", s) if w) or "X"


def s(x):
    return '"' + x.replace('"', "").replace("\\", "") + '"'


def rec(ty, **f):
    return f"(record {A}::{ty} {{" + ", ".join(f"{k} := {v}" for k, v in f.items()) + "})"


def ctor(ty, c):
    return f"(ctor {A}::{ty}.{c})"


def cons(ty, items):
    return "".join(f"(cons {i} " for i in items) + f"(nil {ty})" + ")" * len(items)


def problems(spec, stems):
    held = [d for p in spec["parts"] for d in p.get("decisions", [])]
    out = [f"the decision {d} is a part of {held.count(d)} parts, not one" for d in stems if held.count(d) != 1]
    out += [f"a part holds {d}, which is no decision of the set" for d in set(held) - set(stems)]
    for p in spec["parts"]:
        if bool(p.get("decisions")) == bool(p.get("owed")):
            out.append(f"the part {p['name']} must hold a decision or say what it owes, not both or neither")
    owed = {p["name"] for p in spec["parts"] if p.get("owed")}
    if owed - OWED_AT_MOST:
        out.append(f"owed parts only shrink: {', '.join(sorted(owed - OWED_AT_MOST))} added")
    if OWED_AT_MOST - owed:
        out.append(f"{', '.join(sorted(OWED_AT_MOST - owed))} is realized: take it out of OWED_AT_MOST")
    if REGISTER.exists():
        reg = {x["key"] for x in json.loads(REGISTER.read_text()).get("standards", [])}
        out += [f"the standard {k} is not in the standards register" for k, _, _ in spec["standards"] if k not in reg]
    return out


def module(spec):
    arch = (ROOT / "app/src/Architecture.lex.tex").read_text()
    base = lambda ty: len(re.findall(rf"record {re.escape(A)}::{ty} \{{index := ", arch))
    defs = {}
    d = lambda name, ty, body: defs.__setitem__(name, (f"{A}::{ty}", body))
    b, a = spec["beneficiary"], spec["attribute"]
    d("stakeholderPerson", "Stakeholder", rec("Stakeholder", index=base("Stakeholder"), name=s(b["name"]), text=s(b["text"])))
    d("concernSystemHold", "Concern", rec("Concern", index=base("Concern"), name=s(a["name"]), text=s(a["text"])))
    comps = sorted([("componentSystemHeld", "database", spec["result"]), ("componentSystemPerson", "externalSystem", {"name": b["name"], "text": spec["counterpart"]}),
                    ("componentSystemPrism", "service", spec), ("componentSystemStreams", "externalSystem", spec["input"])])
    index = {"componentBrowser": 0} | {n: base("Component") + i for i, (n, _, _) in enumerate(comps)}
    for n, kind, c in comps:
        d(n, "Component", rec("Component", index=index[n], kind=ctor("ComponentKind", kind), name=s(c["name"]), text=s(c["text"])))
    edges = sorted([("edgeSystemBrowserToPrism", "componentBrowser", "componentSystemPrism", "controlFlow"), ("edgeSystemPersonToPrism", "componentSystemPerson", "componentSystemPrism", "controlFlow"),
                    ("edgeSystemPrismToHeld", "componentSystemPrism", "componentSystemHeld", "dataFlow"), ("edgeSystemPrismToPerson", "componentSystemPrism", "componentSystemPerson", "dataFlow"),
                    ("edgeSystemStreamsToPrism", "componentSystemStreams", "componentSystemPrism", "dataFlow")])
    for i, (n, x, y, kind) in enumerate(edges):
        d(n, "Edge", rec("Edge", index=base("Edge") + i, fromIndex=index[x], toIndex=index[y], kind=ctor("EdgeKind", kind)))
    d("viewpointSystem", "Viewpoint", rec("Viewpoint", index=base("Viewpoint"), stakeholderIndex=base("Stakeholder"), concernIndex=base("Concern"), modelKindIndex=0))
    d("viewSystem", "View", rec("View", index=base("View"), viewpointIndex=base("Viewpoint"), modelKindIndex=0))
    prism, person, main = M + "componentSystemPrism", M + "componentSystemPerson", M + "processSystemMain"
    sd, sd1 = M + "designViewSystem", M + "designViewSystemParts"
    d("processSystemMain", "SystemProcess", rec("SystemProcess", owner=s(prism)))
    for st in (a["from"], a["to"]):
        d(f"stateSystem{pascal(st)}", "SystemState", rec("SystemState", owner=s(person)))
    view = lambda title: rec("DesignView", title=s(title), viewpoint=s(M + "viewpointSystem"), diagram=ctor("DesignDiagram", "opmObjectProcess"))
    d("designViewSystem", "DesignView", view(f"{spec['name']}: {spec['frame']}"))
    d("designViewSystemParts", "DesignView", view(f"Zooming into {spec['mainProcess'].lower()}: the parts of the {spec['name']}"))
    thing = lambda n, v, kind, subject: d(n, "OpmThing", rec("OpmThing", view=s(v), kind=ctor("OpmThingKind", kind), subject=s(subject)))
    link = lambda n, kind, x, y: d(n, "OpmLink", rec("OpmLink", view=s(sd), kind=ctor("OpmLinkKind", kind), source=s(x), target=s(y)))
    for n, _, _ in comps:
        thing("opmSystem" + n.removeprefix("componentSystem"), sd, "object", M + n)
    thing("opmSystemBrowser", sd, "object", "Architecture::componentBrowser")
    thing("opmSystemMain", sd, "process", main)
    for st in (a["from"], a["to"]):
        d(f"opmSystemPerson{pascal(st)}", "OpmState", rec("OpmState", view=s(sd), thing=s(person), state=s(f"{M}stateSystem{pascal(st)}")))
    link("opmSystemPersonAgent", "agent", person, main)
    link("opmSystemPersonEffect", "effect", person, main)
    link("opmSystemPrismExhibits", "exhibition", prism, main)
    link("opmSystemBrowserInstrument", "instrument", "Architecture::componentBrowser", main)
    link("opmSystemStreamsConsumed", "consumption", M + "componentSystemStreams", main)
    link("opmSystemHeldResult", "result", main, M + "componentSystemHeld")  # a result runs from the process to what it makes
    thing("opmSystemPartsMain", sd1, "process", main)
    zoom = lambda n, x, y, order: d(n, "OpmZoom", rec("OpmZoom", view=s(sd1), process=s(x), subprocess=s(y), order=order))
    for order, p in enumerate(spec["parts"]):
        part = f"{M}processSystemPart{p['name']}"
        d(f"processSystemPart{p['name']}", "SystemProcess", rec("SystemProcess", owner=s(prism)))
        thing(f"opmSystemPartsPart{p['name']}", sd1, "process", part)
        zoom(f"opmSystemZoom{p['name']}", main, part, order)
        for k, dec in enumerate(p.get("decisions", [])):
            decide = f"Design::processPrism{pascal(dec)}Decide"
            thing(f"opmSystemPartsDecide{pascal(dec)}", sd1, "process", decide)
            zoom(f"opmSystemZoom{p['name']}{pascal(dec)}", part, decide, k)
    defs["systemPartsOwed"] = ("(List String)", cons("String", [s(f"{p['name']}: {p['owed']}") for p in spec["parts"] if p.get("owed")]))
    evidence = cons("String", [s(sd), s(sd1)])
    obligations = [f"(record Compliance::Obligation {{index := {i}, standard := {s(t)}, subject := {s(spec['name'] + ': ' + k)}, text := {s(x)}, evidence := {evidence}}})" for i, (k, t, x) in enumerate(spec["standards"])]
    defs["systemStandards"] = ("(List Compliance::Obligation)", cons("Compliance::Obligation", obligations))
    body = "\n".join(f"definition{{\n  name: {n},\n  parameters: [],\n  result: {ty},\n  body: {v}\n}}\n" for n, (ty, v) in defs.items())
    body += "\ntheorem{\n  name: systemStandardsEvidenced,\n  parameters: [],\n  statement: ((Compliance::obligationsEvidenced 0 (systemStandards)) = true),\n  proof: decide{}\n}\n"
    head = "".join(f"\\useglossary{{{g}}}\n" for g in ("lexlean.std.bool@1.2.0", "lexlean.std.nat@1.2.0", "prism.arch@1.0.0"))
    head += "".join(f"\\importmodule{{{m}}}\n" for m in ("Architecture", "Compliance", "Design", "Foundation.Arch"))
    return f"\\begin{{lexlean}}{{PrismSystem}}\n{head}\\title{{design view}}\n\\begin{{semanticmodule}}\n{body}\\end{{semanticmodule}}\n\\end{{lexlean}}\n"


def main(argv):
    spec = json.loads((ROOT / "app/specs/system/spec.json").read_text())
    stems = [p.removesuffix(".prompt.json") for p in json.loads((ROOT / "app/prompts/set.json").read_text())["prompts"]]
    bad = problems(spec, stems)
    text = module(spec)
    if argv == ["--check"] and (not OUT.exists() or OUT.read_text() != text):
        bad.append(f"{OUT.relative_to(ROOT)} is stale: run python3 -I tools/system/gen.py")
    for p in bad:
        print(p)
    if bad:
        sys.exit("SY-01: the system model is incomplete")
    if argv != ["--check"]:
        OUT.write_text(text)
    owed = [p["name"] for p in spec["parts"] if p.get("owed")]
    print(f"system: {len(spec['parts'])} parts, {len(stems)} decisions each a part's once, {len(spec['standards'])} standards; owed: {', '.join(owed) or 'none'}")


if __name__ == "__main__":
    main(sys.argv[1:])
