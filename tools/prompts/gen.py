"""Gives every decision the Prism's builder owns its full model: python3 -I tools/prompts/gen.py [--check]

Each facet named in app/prompts/set.json is decided by its specification,
app/specs/<facet>/spec.json. This writes that specification as a
prism/prompt/1 prompt (app/prompts/<facet>.prompt.json) and runs the builder
vendored at tools/builder (afflom/prism-devrel, pinned in tools/builder/VENDOR.md)
with `build-set`. The set names this repository's own root (Prism), so the
builder writes each decision's model and constructive proofs and one set of
facet modules for them all (Architecture ISO/IEC/IEEE 42010, Design OPM ISO
19450 and UML, Features, Quality ISO/IEC 25010, Security STRIDE with the
threat model, Compliance), their conformance tests and feature suites, and
their rows in model/ids.toml, and leaves the root and the page to the repository.
A spec whose examples are raw lines a reader reads (`read`, as kappa's) gives
the builder the fields its reader reads from each (read_examples).

With --check nothing is written and any stale prompt or generated file fails.
"""

import importlib.util
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SET = ROOT / "app/prompts/set.json"
CHECK = sys.argv[1:] == ["--check"]
if sys.argv[1:] not in ([], ["--check"]):
    sys.exit("usage: tools/prompts/gen.py [--check]")

# What a prompt's app carries, taken from the specification as it is.
APP_KEYS = ["name", "title", "purpose", "fields", "outcomes", "meanings", "rules", "otherwise", "otherwiseWhy", "properties", "examples"]
# The instant the generated files say they were last modified: the set's own, so a rerun writes the same bytes.
SETTING = json.loads(SET.read_text())
LAST = SETTING.pop("lastModified")


def condition(field, value, holds):
    return {"field": field, "op": "is" if holds else "is not", "value": value}


def said(when, then):
    return "when " + " and ".join(f"{c['field']} {c['op']} {c['value']}" for c in when) + f" then {then}"


def read_examples(facet, spec):
    """The examples of a spec whose requests are raw lines a reader reads (it
    says how under `read`, as kappa does: the label's colon, axis, digit count
    and hex are read from the label itself), as the builder's field-level pairs.
    The reader is the facet's own, tools/<facet>/gen.py's `request(line)`, the
    Python twin of the Lean reader module it writes: each example becomes the
    fields it reads, in the spec's order, and the first word of the response,
    which is the decision's answer (the reader adds what it names after it).
    A line the reader refuses is the reader's example, not the decision's, and
    a pair two examples read alike is kept once."""
    path = ROOT / f"tools/{facet}/gen.py"
    load = importlib.util.spec_from_file_location(f"{facet}_reader", path)
    reader = importlib.util.module_from_spec(load)
    load.loader.exec_module(reader)
    pairs = []
    for line, response in spec["examples"]:
        fields = reader.request(line)
        if fields is None:
            continue
        pair = (" ".join(fields[f["name"]] for f in spec["fields"]), response.split(" ")[0])
        if pair not in pairs:
            pairs.append(pair)
    return pairs


def from_tree(spec, examples):
    """A keyword facet's spec (dest, uorc, resonance, router and their kin): a binary decision
    tree over choice fields, its guarantees and its examples as pairs. Read as
    the builder's decision table: every root-to-leaf path in then-first order is
    one first-match rule, the path that fails every test is `otherwise`, each
    guarantee is an always or never property, and every field is a choice.
    `examples` are the spec's, or what read_examples reads them as.
    A path keeps only its `is` tests: the rules before it already answer every
    request that passed one of its `is not` tests, so the table stays small enough
    for the builder's proofs."""
    rules, rest = [], []

    def walk(node, path):
        if isinstance(node, str):
            if all(c["op"] == "is not" for c in path):
                rest.append(node)
            else:
                # First-match drops every `is not`: every leaf under the `then` it
                # negates is an earlier rule, so a request that took that `then` met one.
                rules.append(([c for c in path if c["op"] == "is"], node))
            return
        field, value = node["if"]
        walk(node["then"], path + [condition(field, value, True)])
        walk(node["else"], path + [condition(field, value, False)])

    walk(spec["tree"], [])
    assert len(rest) == 1, f"{spec['name']}: the tree has one all-else path"
    title = spec.get("title", spec["name"])
    app = {
        "name": spec["name"],
        "title": title,
        "purpose": spec["purpose"],
        "fields": [{"name": f["name"], "kind": "choice", "values": f["values"], "means": f["means"]} for f in spec["fields"]],
        "outcomes": spec["outcomes"],
        "meanings": spec["meanings"],
        "rules": [
            {"id": f"REQ-{i:03}", "when": when, "then": then, "says": said(when, then), "why": f"{title}: the decision tree's path to {then}"}
            for i, (when, then) in enumerate(rules, 1)
        ],
        "otherwise": rest[0],
        "otherwiseWhy": f"{title}: the decision tree's path that meets no test",
        "properties": [],
        "examples": [{"request": r, "response": o} for r, o in examples],
    }
    # A guarantee that names several answers it never gives is one property per answer.
    for g in spec["guarantees"]:
        when = [condition(f, v, True) for f, v in g["when"]]
        for kind, then in [("always", g["always"])] if "always" in g else [("never", a) for a in g["never"]]:
            n = len(app["properties"]) + 1
            app["properties"].append({"id": f"INV-{n:03}", "kind": kind, "when": when, "then": then, "says": f"{kind} " + said(when, then), "why": g["why"]})
    return app


def prompt(facet):
    spec = json.loads((ROOT / f"app/specs/{facet}/spec.json").read_text())
    examples = read_examples(facet, spec) if spec.get("read") else spec.get("examples")
    app = from_tree(spec, examples) if "tree" in spec else {k: spec[k] for k in APP_KEYS if k in spec}
    old = ROOT / f"app/prompts/{facet}.prompt.json"
    axioms = json.loads(old.read_text()).get("axioms", {}) if old.exists() else {}
    out = {"schema": "prism/prompt/1", "goal": spec["purpose"][:200], "pattern": "decisionTable", "repository": SETTING["repository"], "app": app}
    if axioms:
        out["axioms"] = axioms
    return json.dumps(out, indent=2, ensure_ascii=False) + "\n"


stale = []
for name in SETTING["prompts"]:
    facet = name.removesuffix(".prompt.json")
    path = ROOT / f"app/prompts/{name}"
    text = prompt(facet)
    if path.exists() and path.read_text() == text:
        continue
    if CHECK:
        stale.append(str(path.relative_to(ROOT)))
    else:
        path.write_text(text)
if stale:
    sys.exit(f"stale, rerun tools/prompts/gen.py: {', '.join(stale)}")

cmd = ["node", str(ROOT / "tools/builder/cli.mjs"), "build-set", str(SET), "--out", str(ROOT), "--last-modified", LAST]
if CHECK:
    cmd.append("--check")
sys.exit(subprocess.run(cmd).returncode)
