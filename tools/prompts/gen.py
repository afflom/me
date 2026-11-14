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

With --check nothing is written and any stale prompt or generated file fails.
"""

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


def prompt(facet):
    spec = json.loads((ROOT / f"app/specs/{facet}/spec.json").read_text())
    app = {k: spec[k] for k in APP_KEYS if k in spec}
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
