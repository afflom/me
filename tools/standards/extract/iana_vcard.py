"""The elements IANA's vCard Elements registry lists for one RFC, each a requirement.

Every property, parameter, value type, property value and parameter value the
registry (vcard-elements.xml) records with a reference to the standard's RFC
("rfc", default the standard's key) is one requirement: the RFC must be read
for it. A row that cites RFC 6350 belongs to RFC 6350 even where a later RFC
updates it. An id is <key>-<kind>-<name>, the name's "=" and ":" written "-",
and a parameter value's id also names the first property it applies to. The
same ids are the inventory of tools/oracle/vcard.py, whose generated suite
test/vcard.registry.test.mjs marks each one it enforces.
"""
import re
import xml.etree.ElementTree as ET

NS = "{http://www.iana.org/assignments}"
KINDS = {"properties": "property", "parameters": "parameter", "value-data-types": "value-type",
         "property-values": "property-value", "parameter-values": "parameter-value"}


def ident(key, kind, name, prop=None):
    return f"{key}-{kind}-{re.sub(r'[=:]', '-', name)}" + (f"-{prop}" if prop else "")


def rows(root, rfc):
    """(kind, name, property, section) for each registry row the RFC defines."""
    for reg_id, kind in KINDS.items():
        reg = root.find(f"{NS}registry[@id='{reg_id}']")
        for rec in reg.findall(f"{NS}record"):
            refs = [x for x in rec.iter(f"{NS}xref") if x.get("type") == "rfc"]
            cites = [x.get("data") for x in refs]
            if rfc not in cites or (rfc != "rfc6350" and "rfc6350" in cites):
                continue
            get = lambda tag: " ".join((rec.findtext(f"{NS}{tag}") or "").split())
            sec = next(x.get("section") for x in refs if x.get("data") == rfc)
            if kind in ("property", "parameter"):
                yield kind, get("description") or get("name"), None, sec
            elif kind == "value-type":
                yield kind, get("name").lower(), None, sec
            elif kind == "property-value":
                yield kind, f"{get('name')}:{get('description')}", None, sec
            else:
                props = [p.strip() for p in re.split(r",|\band\b", get("name")) if p.strip()]
                yield kind, f"{get('description')}={get('value')}", props[0], sec


def requirements(data, standard, inv):
    rfc = inv.get("rfc", standard["key"])
    out, seen = [], set()
    for kind, name, prop, sec in rows(ET.fromstring(data), rfc):
        # The registry lists some values twice (RELATED's TYPE=emergency): one requirement each.
        if ident(standard["key"], kind, name, prop) in seen:
            continue
        seen.add(ident(standard["key"], kind, name, prop))
        out.append({"id": ident(standard["key"], kind, name, prop), "kind": "element",
                    "ref": f"{rfc.upper().replace('RFC', 'RFC ')} {sec}" if sec else rfc.upper().replace("RFC", "RFC "),
                    "text": f"The {kind.replace('-', ' ')} {name} registered by IANA's vCard Elements registry is read as its RFC defines it"})
    if not out:
        raise ValueError(f"{standard['key']}: the vCard registry lists no element of {rfc}")
    return out
