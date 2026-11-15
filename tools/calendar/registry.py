"""The iCalendar registry as data: site/calendar/registry.mjs, which generators/calendar writes.

GenCalendar (generators/calendar/src/GenCalendar.lex.tex) reads the two pinned
sources of app/specs/calendar/spec.json, the IANA iCalendar Element Registries
and RFC 5545's section 3, into site/calendar/registry.mjs (tools/generators/run.sh,
held by GN-01). load() reads that file back for the Python tools that grade by
it: the element suite (tools/calendar/gen.py) and the oracle's reference reader.
records_of() reads the registries' XML for ST-01's iana-icalendar extractor.
"""
import json
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "site/calendar/registry.mjs"
NS = {"i": "http://www.iana.org/assignments"}


def load():
    """The registry GenCalendar wrote: the object after `export const REGISTRY =`."""
    text = REGISTRY.read_text(encoding="utf-8")
    return json.loads(text.split("export const REGISTRY = ", 1)[1].rstrip().rstrip(";"))


def records_of(xml):
    """Every record of the registries' XML bytes: (sub-registry, name, status, [(rfc, section)])."""
    root = ET.fromstring(xml)
    out = []
    for sub in root.findall("i:registry", NS):
        for record in sub.findall("i:record", NS):
            refs = [(x.get("data"), x.get("section")) for x in record.iter() if x.tag.endswith("xref") and x.get("type") == "rfc"]
            out.append((sub.get("id"), record.find("i:name", NS).text.strip(), (record.find("i:type", NS).text or "").strip(), refs))
    return out
