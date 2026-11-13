"""Binds the Prism's facets into one runtime: app/specs/coherence/spec.json.

    python3 -I tools/coherence/gen.py            write site/coherence/coherence.mjs
    python3 -I tools/coherence/gen.py --check    refuse unless the file on disk is current
    python3 -I tools/coherence/gen.py --spec P   read another spec (planted-defect tests)

After verdant resonance: each facet is one model with typed ports (MetaModel's
interface and composition), and the page runs on the flow those ports make
(the functor bus). The flow is refused, and nothing is written, when:
  - a facet of the root (tools/prism_root.py) is not in the registry, or one
    in the registry is not in the root;
  - a live facet's modules never ask the root for it;
  - a sealed facet names a host surface that PrismHost does not seal, or
    drives anything on the page;
  - a port a live facet takes is never produced, or a port it gives is never
    taken and is not a sink, or a sink cannot be reached from the owner;
  - a feeder's media has no domain, or its surface is not one PrismHost knows;
  - a place that lists items has no feeder reaching one of its domains;
  - an act or a setting of the surface is driven by no live facet;
  - a domain has no vocabulary.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = sys.argv[1:]
spec_path = pathlib.Path(args[args.index("--spec") + 1]) if "--spec" in args else ROOT / "app/specs/coherence/spec.json"
SPEC = json.loads(spec_path.read_text())
SURFACE = json.loads((ROOT / "app/specs/surface/spec.json").read_text())
HOST_SPEC = (ROOT / "app/specs/host/spec.json").read_text()
OUT = ROOT / "site/coherence/coherence.mjs"


def refuse(why):
    sys.exit(f"coherence: {why}")


# The root's facets, as tools/prism_root.py declares them.
root_src = (ROOT / "tools/prism_root.py").read_text()
root_block = root_src[root_src.index("FACETS = [") : root_src.index("]", root_src.index("FACETS = ["))]
ROOT_FACETS = re.findall(r'\(\s*"([a-z0-9]+)"\s*,', root_block)
host_src = (ROOT / "site/device/host.mjs").read_text()
SURFACES = re.findall(r"'([a-z]+)'", re.search(r"export const SURFACES = \[([^\]]*)\]", host_src).group(1))

ports = [p["key"] for p in SPEC["ports"]]
facets = SPEC["facets"]
keys = [f["key"] for f in facets]
missing = sorted(set(ROOT_FACETS) - set(keys))
if missing:
    refuse(f"the root routes {', '.join(missing)} but the registry has no model of it: add each to app/specs/coherence/spec.json with its ports and the page modules that ask it, or seal it by a PrismHost surface")
extra = sorted(set(keys) - set(ROOT_FACETS))
if extra:
    refuse(f"the registry models {', '.join(extra)}, which the root does not route")

live = [f for f in facets if "sealed" not in f]
for f in facets:
    if "sealed" in f:
        if f.get("drives"):
            refuse(f"{f['key']} is sealed but drives the page; a sealed facet shows nothing")
        if f.get("sealedBy") == "host" and f["sealed"] not in SURFACES:
            refuse(f"{f['key']} is sealed by host surface {f['sealed']!r}, which PrismHost does not know")
        if f.get("sealedBy") == "host" and f'when surface is {f["sealed"]} then sealed' not in HOST_SPEC:
            refuse(f"{f['key']} is sealed by host surface {f['sealed']!r}, but PrismHost does not seal it")
        continue
    for port in f["in"] + f["out"]:
        if port not in ports:
            refuse(f"{f['key']} names port {port!r}, which is not a port")
    if not f.get("modules"):
        refuse(f"{f['key']} is live but no page module asks it")
    asked = False
    for module in f["modules"]:
        path = ROOT / module
        if not path.exists():
            refuse(f"{f['key']} names {module}, which does not exist")
        if re.search(r"[`'\"]%s[ `'\"]" % re.escape(f["line"]), path.read_text()):
            asked = True
    if not asked:
        refuse(f"no module of {f['key']} ({', '.join(f['modules'])}) asks the root for {f['line']!r}")

# The flow: from the owner, a live facet fires once one of its ports is reached.
produced = {"owner"} | {p for f in live for p in f["out"]}
for f in live:
    for port in f["in"]:
        if port not in produced:
            refuse(f"{f['key']} takes {port!r}, which no live facet gives")
taken = {p for f in live for p in f["in"]}
for f in live:
    for port in f["out"]:
        if port not in taken and port not in SPEC["sinks"]:
            refuse(f"{f['key']} gives {port!r}, which no facet takes and the owner never sees")
reached, fired = {"owner"}, set()
while True:
    more = [f for f in live if f["key"] not in fired and set(f["in"]) & reached]
    if not more:
        break
    for f in more:
        fired.add(f["key"])
        reached |= set(f["out"])
for f in live:
    if f["key"] not in fired:
        refuse(f"{f['key']} can never fire: none of {f['in']} is reached from the owner")
for sink in SPEC["sinks"]:
    if sink not in reached:
        refuse(f"the sink {sink!r} is never reached from the owner")

# Feeders, places, acts and settings: the surface is fed and driven.
media_domain = SURFACE["media"]
vocab = SPEC["vocabulary"]
if len(vocab) != len(SURFACE["domains"]) or any(not terms for terms in vocab):
    refuse("every domain of the design model needs its vocabulary, in domain order")
fed = set()
for feeder in SPEC["feeders"]:
    if "surface" in feeder and feeder["surface"] not in SURFACES:
        refuse(f"feeder {feeder['key']} uses surface {feeder['surface']!r}, which PrismHost does not know")
    if "act" in feeder and feeder["act"] not in [a["key"] for a in SURFACE["acts"]]:
        refuse(f"feeder {feeder['key']} uses act {feeder['act']!r}, which the surface does not have")
    for media in feeder["media"]:
        if media not in media_domain:
            refuse(f"feeder {feeder['key']} brings {media!r}, which has no domain in the surface's media table")
        fed.add(media_domain[media])
# Plain text reaches every domain whose vocabulary it uses.
if any("plainText" in feeder["media"] for feeder in SPEC["feeders"]):
    fed |= set(range(len(vocab)))
drives = {"places": set(), "acts": set(), "settings": set()}
for f in live:
    for kind, names in f.get("drives", {}).items():
        drives[kind] |= set(names)
for place in SURFACE["places"]:
    if place["show"] in ("list", "search") and not set(place["domains"]) & fed:
        refuse(f"the place {place['key']} lists items but no feeder reaches its domains")
    if place["act"] != "none" and place["act"] not in drives["acts"]:
        refuse(f"the place {place['key']}'s act {place['act']!r} is driven by no live facet")
for setting in SURFACE["settings"]:
    if setting["key"] not in drives["settings"]:
        refuse(f"the setting {setting['key']} is driven by no live facet")

if SPEC["people"]["place"] not in [p["key"] for p in SURFACE["places"] if p["show"] == "list"]:
    refuse(f"people are listed in {SPEC['people']['place']!r}, which is not a place that lists items")

# The functor matrix: facet a feeds facet b where a's outputs meet b's inputs.
matrix = [[sorted(set(a["out"]) & set(b["in"])) for b in live] for a in live]

j = lambda v: json.dumps(v, ensure_ascii=False)
text = f"""// Generated by tools/coherence/gen.py from app/specs/coherence/spec.json. Do not edit.
// Every facet of the root as one model with typed ports, and the flow that
// binds them: the page reads domains, vocabulary and intents from here only.

export const PORTS = {j(ports)};
export const FACETS = {j([{k: f[k] for k in ("key", "line", "in", "out", "drives") if k in f} for f in live])};
export const SEALED = {j([{"key": f["key"], "sealed": f["sealed"]} for f in facets if "sealed" in f])};
export const FLOW = {j(matrix)};
export const FEEDERS = {j(SPEC["feeders"])};
export const MEDIA = {j(media_domain)};
export const VOCABULARY = {j(vocab)};
export const INTENTS = {j(SPEC["intents"])};
export const TODAY = {j(SPEC["today"])};
export const PEOPLE = {j(SPEC["people"])};
"""

if "--check" in args:
    if not OUT.exists() or OUT.read_text() != text:
        refuse("site/coherence/coherence.mjs is stale: run python3 -I tools/coherence/gen.py")
    sys.exit(0)
if "--spec" not in args:
    OUT.write_text(text)
print(f"coherence: {len(live)} live facets, {len(facets) - len(live)} sealed, {sum(1 for row in matrix for cell in row if cell)} flows")
