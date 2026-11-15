"""The iCalendar registry as data: what IANA registers for a standard, with what its RFC's section 3 says of each element.

build(cache) reads the two pinned sources named in app/specs/oracle/spec.json
"registries" and returns the registry tools/calendar/gen.py writes to
site/calendar/registry.mjs, which the oracle's reference reader also reads by.
"""
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "oracle"))
import rfc5545  # noqa: E402
from pin import fetch, refuse, unpaginate  # noqa: E402

ROOT = HERE.parents[1]
SPEC = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
NS = {"i": "http://www.iana.org/assignments"}

# Which IANA sub-registry holds which kind of element, and which hold the values a parameter or property may take.
KINDS = {"components": "component", "properties": "property", "parameters": "parameter", "value-data-types": "value"}


def registry(source, cache):
    """Every record of the registries: (sub-registry, name, status, [(rfc, section)])."""
    root = ET.fromstring(fetch(source, cache).encode("utf-8"))
    out = []
    for sub in root.findall("i:registry", NS):
        for record in sub.findall("i:record", NS):
            refs = [(x.get("data"), x.get("section")) for x in record.iter() if x.tag.endswith("xref") and x.get("type") == "rfc"]
            out.append((sub.get("id"), record.find("i:name", NS).text.strip(), (record.find("i:type", NS).text or "").strip(), refs))
    return out


def build(cache=None):
    reg = next(r for r in SPEC["registries"] if r["key"] == "iana-icalendar")
    standard = reg["standard"]
    text = unpaginate(fetch(next(s for s in SPEC["sources"] if s["key"] == reg["text"]), cache))
    records = registry(reg, cache)
    # This standard's own elements: those IANA registers with a section of it, and in current use.
    mine = [(sub, name, [sec for rfc, sec in refs if rfc == standard][0]) for sub, name, status, refs in records if status == "Current" and any(rfc == standard for rfc, _ in refs)]
    value_types = sorted(name for sub, name, _ in mine if sub == "value-data-types")
    defined = {d["section"]: d for d in rfc5545.definitions(text, value_types).values()}
    out = {"standard": standard, "source": {"registry": reg["url"], "sha256": reg["sha256"]}, "components": {}, "properties": {}, "parameters": {}, "values": {}}
    for sub, name, section in mine:
        kind = KINDS.get(sub)
        if not kind:
            continue
        entry = {"section": section}
        d = defined.get(section)
        if kind == "property":
            if not d or d["name"] != name:
                refuse(f"{standard} section {section} does not define the property {name} that IANA registers there")
            entry.update({"types": d["types"], "many": d["many"], "parts": d["parts"]})
        if kind == "parameter" and (not d or d["name"] != name):
            refuse(f"{standard} section {section} does not define the parameter {name} that IANA registers there")
        out[{"component": "components", "property": "properties", "parameter": "parameters", "value": "values"}[kind]][name] = entry
    # The values a parameter or property may take: each value registry's records point at the section that defines its field.
    by_section = {e["section"]: (group, name) for group in ("parameters", "properties") for name, e in out[group].items()}
    for sub, name, section in mine:
        if sub in KINDS:
            continue
        owner = by_section.get(section.split(";")[0])
        if not owner:
            continue
        group, field = owner
        out[group][field].setdefault("registered", []).append(name)
    for group in ("parameters", "properties"):
        for e in out[group].values():
            if "registered" in e:
                e["registered"] = sorted(set(e["registered"]))
    for group in ("components", "properties", "parameters", "values"):
        out[group] = dict(sorted(out[group].items()))
    return out


