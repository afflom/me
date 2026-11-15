"""The elements a standard's IANA iCalendar registry lists, each a requirement.

Every component, property, parameter and value data type that the IANA
iCalendar Element Registries list as Current with a section of the standard,
and every value that a value registry lists for one of those parameters or
properties. Each one is a requirement that a reader knows the element as its
section defines it. The registry is read by tools/calendar/registry.py, the
same reading that generates the Prism's calendar reader (site/calendar/registry.mjs).
An id is <key>-component-<NAME>, -property-, -parameter-, -value-, or
<key>-enum-<FIELD>-<VALUE>.
"""
import importlib.util
import pathlib

_path = pathlib.Path(__file__).resolve().parents[2] / "calendar/registry.py"
_spec = importlib.util.spec_from_file_location("calendar_registry", _path)
registry = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(registry)

GROUP = {"components": "component", "properties": "property", "parameters": "parameter", "value-data-types": "value"}


def requirements(data, standard, inv):
    key = standard["key"]
    mine = [(sub, name, [sec for rfc, sec in refs if rfc == key][0]) for sub, name, status, refs in registry.records_of(data) if status == "Current" and any(rfc == key for rfc, _ in refs)]
    out = []
    fields = {}
    for sub, name, section in mine:
        kind = GROUP.get(sub)
        if kind:
            out.append({"id": f"{key}-{kind}-{name}", "kind": "must", "ref": f"{key.upper()} {section}", "text": f"The {kind} {name}, read as section {section} defines it"})
            if kind in ("property", "parameter"):
                fields[section] = name
    for sub, name, section in mine:
        field = None if sub in GROUP else fields.get(section.split(";")[0])
        if field:
            out.append({"id": f"{key}-enum-{field}-{name}", "kind": "must", "ref": f"{key.upper()} {section}", "text": f"The value {name} of {field}, known as registered"})
    if not out:
        raise ValueError(f"{key}: the registry lists no element of it")
    return list({r["id"]: r for r in out}.values())
