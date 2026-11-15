"""vCard as its standard defines it: app/specs/oracle/vcard.json.

Two pinned authorities, nothing written by hand:
  - RFC 6350 itself. Each property's section in chapter 6 gives its
    cardinality, its ABNF (the parameters it takes, the value it holds and the
    value types VALUE= may reset it to) and its own examples. Chapter 5 gives
    each parameter's name, from its ABNF rule `x-param = "NAME=" ...`.
  - IANA's vCard Elements registry: every property, parameter, value type,
    property value and parameter value registered, with the RFC section that
    defines it. The rows RFC 6350 defines are the standard's full inventory.

The property table the page reads with (site/read/vcard.table.mjs) is derived
from the ABNF: a value whose rule joins components with ";" is structured, a
component (or a value) that is a list-component or text-list holds a list
split at ",", and the first alternative of the value rule is its default
type. Every example line of chapter 6 is an oracle example (test/oracle/
vcard.json), read here by a reference reader written to RFC 6350 section 3.3
(content lines, parameters, quoted values) and 3.4 (escapes). A registry
entry no example exercises gets one derived mechanically from the RFC's own
example of a property it applies to, with that parameter value or property
value put in: the registry and the RFC example are the only inputs, and each
derived example names the example it came from.

The inventory lists every RFC 6350 registry row with what implements it (the
table entry) and what exercises it (example ids); a row with neither is
refused unless app/specs/oracle/vcard.json lists it in `debt` with a reason.

Writes site/read/vcard.table.mjs and test/oracle/vcard.json; --check refuses
either if stale. --cache DIR reads and keeps the fetched sources there.

usage: python3 -I tools/oracle/vcard.py [--check] [--cache DIR]
"""
import hashlib
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/oracle/vcard.json").read_text(encoding="utf-8"))
ORACLE = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
TABLE = ROOT / "site/read/vcard.table.mjs"
OUT = ROOT / "test/oracle/vcard.json"
args = sys.argv[1:]
cache = pathlib.Path(args[args.index("--cache") + 1]) if "--cache" in args else None
STANDARD = SPEC["standard"]


def refuse(why):
    sys.exit(f"vcard: {why}")


def fetch(source):
    path = cache / f"{source['key']}.txt" if cache else None
    if path and path.exists():
        data = path.read_bytes()
    else:
        with urllib.request.urlopen(source["url"], timeout=60) as response:
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != source["sha256"]:
        refuse(f"{source['key']} at {source['url']} is {digest}, not the pinned {source['sha256']}")
    return data.decode("utf-8")


def unpaginate(text):
    """The RFC's text without its page breaks (footer, form feed, header)."""
    lines = text.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("\f"):
            while out and not out[-1].strip():
                out.pop()
            if out and re.search(r"\[Page \d+\]\s*$", out[-1]):
                out.pop()
            while out and not out[-1].strip():
                out.pop()
            i += 1
            if i < len(lines) and lines[i].startswith("RFC "):
                i += 1
            while i < len(lines) and not lines[i].strip():
                i += 1
            if not (out and i < len(lines) and out[-1].startswith("   ") and lines[i].startswith("   ")):
                out.append("")
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


source = {s["key"]: s for s in SPEC["sources"]}
rfc = SPEC["sources"][0]
pinned = next((s for s in ORACLE["sources"] if s["key"] == rfc["key"]), None)
if not pinned or pinned["sha256"] != rfc["sha256"]:
    refuse(f"{rfc['key']} must be the source app/specs/oracle/spec.json pins, at the same sha256")
text = unpaginate(fetch(rfc))
registry = ET.fromstring(fetch(source["iana-vcard"]))
NS = "{http://www.iana.org/assignments}"


# ---- RFC 6350's grammar, as its ABNF blocks state it -------------------------

def abnf_rules(block):
    """name -> definition, continuation lines joined, comments dropped."""
    rules, current = {}, None
    m = re.search(r"\n   ABNF:\n(.*?)(?=\n   [A-Z][a-z]+( [a-z]+)*(\(s\))?:|\Z)", block, re.S)
    if not m:
        return rules
    for line in m.group(1).split("\n"):
        body = line.split(";", 1)[0] if line.strip().startswith(";") else re.sub(r"\s;\s.*$", "", line)
        if not body.strip():
            continue
        d = re.match(r"^\s+([A-Za-z][A-Za-z0-9-]*)\s*(=/|=)\s*(.*)$", body)
        if d:
            current = d.group(1)
            rules[current] = (rules.get(current, "") + " / " if d.group(2) == "=/" else "") + d.group(3).strip()
        elif current:
            rules[current] += " " + body.strip()
    return rules


def alternatives(rule):
    """The top-level alternatives of an ABNF definition."""
    out, depth, cur, quoted = [], 0, "", False
    for ch in rule:
        if ch == '"':
            quoted = not quoted
        if not quoted and ch in "([":
            depth += 1
        if not quoted and ch in ")]":
            depth -= 1
        if ch == "/" and depth == 0 and not quoted:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    return [a for a in out + [cur.strip()] if a]


TYPE_OF = {"text": "text", "text-list": "text", "list-component": "text", "component": "text", "uri": "uri",
           "date-and-or-time": "date-and-or-time", "timestamp": "timestamp", "utc-offset": "utc-offset",
           "language-tag": "language-tag", "sex": "text"}


def type_of(token, rules):
    t = token.lower()
    if t.startswith('"'):
        return "text"
    if t in TYPE_OF:
        return TYPE_OF[t]
    if t.endswith("-uri-value"):
        return "uri"
    if t.endswith("-text-value"):
        return "text"
    if token in rules:
        return type_of(alternatives(rules[token])[0].split()[0], rules)
    if re.match(r"^\d*\*?\d*digit", t):
        return "integer"
    refuse(f"no value type for ABNF token {token}")


# Chapter 5: each parameter's name, from its rule `token = "NAME=" ...`.
chapter5 = text[text.index("\n5.  Property Parameters\n"):text.index("\n6.  vCard Properties\n")]
chapter6 = text[text.index("\n6.  vCard Properties\n"):text.index("\n6.10.  Extended Properties")]
PARAM_TOKEN = {m.group(1): m.group(2) for m in re.finditer(r'^\s+([a-z-]+)\s*=\s*"([A-Z-]+)="', text, re.M)}
# A parameter is defined where its rule is: chapter 5, or the property it belongs to (LABEL, 6.3.1).
PARAMETERS = {}
for h in re.finditer(r"^(\d\.\d+(?:\.\d+)?)\.  ([A-Z][A-Z0-9-]*)\n", text, re.M):
    sec_end = text.find("\n\n", h.end())
    nxt = re.search(r"^\d\.\d+(?:\.\d+)?\.  ", text[h.end():], re.M)
    body = text[h.end():h.end() + (nxt.start() if nxt else len(text))]
    for tok, pname in PARAM_TOKEN.items():
        if re.search(rf"^\s+{re.escape(tok)}\s*=", body, re.M) and pname not in PARAMETERS:
            PARAMETERS[pname] = {"section": h.group(1)}


def section_blocks(chapter, pattern):
    heads = list(re.finditer(pattern, chapter, re.M))
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(chapter)
        yield h, re.split(r"\n\d+\.\d+\.  ", chapter[h.end():end])[0]


PROPERTIES = {}
EXAMPLE_LINES = []
for h, block in section_blocks(chapter6, r"^(6\.\d+\.\d+)\.  ([A-Z][A-Z0-9-]*)\n"):
    name, section = h.group(2), h.group(1)
    card = re.search(r"\n   Cardinality:\s+(\S+)", block).group(1)
    rules = abnf_rules(block)
    value = rules.get(f"{name}-value")
    if value is None:
        refuse(f"RFC 6350 {section} {name} has no {name}-value rule")
    alts = alternatives(value)
    structured = '";"' in value
    parts = re.findall(r'[A-Za-z][A-Za-z0-9-]*', value) if structured else []
    lists = structured and all(type_of(p, rules) == "text" and (p == "list-component" or rules.get(p, "") == "list-component") for p in parts if p not in ("DIGIT", "URI"))
    single = alts[0].split()[0]
    entry = {"section": section, "cardinality": card, "default": type_of(single, rules) if not structured else "text"}
    if structured:
        entry["shape"] = "structured"
        if lists:
            entry["components"] = "list"
    elif single.lower() == "text-list":
        entry["shape"] = "list"
    types = sorted({m.lower() for m in re.findall(r'"VALUE=([a-z-]+)"', " ".join(v for k, v in rules.items() if k.startswith(name + "-param")))})
    if types:
        entry["types"] = types
    params = set()
    for k, v in rules.items():
        if k.startswith(name + "-param"):
            for tok in re.findall(r"[a-z-]+-parameter|[a-z][a-z0-9-]*-param(?:-[a-z]+)?", v):
                base = re.sub(r"-param-[a-z]+$", "-param", tok)
                if base in PARAM_TOKEN:
                    params.add(PARAM_TOKEN[base])
            if '"VALUE=' in v:
                params.add("VALUE")
    for k, v in rules.items():
        if re.match(r"^[a-z-]+-param$", k) and k in PARAM_TOKEN and k.replace("-param", "") not in ("value",) and k != "any-param":
            params.add(PARAM_TOKEN[k])
    if params:
        entry["params"] = sorted(params)
    enum = [a.strip('"') for a in alts if a.startswith('"')]
    if enum and all(a.startswith('"') for a in alts):
        entry["values"] = enum
    PROPERTIES[name] = entry
    m = re.search(r"\n   Examples?:(.*)$", block, re.S)
    if m:
        EXAMPLE_LINES.append((name, section, m.group(1)))
# Chapter 5 shows each parameter on the properties it applies to.
# Chapter 5 shows each parameter on the properties it applies to, in its prose as well as
# under "Examples": every indented content line outside its ABNF.
for h, block in section_blocks(chapter5, r"^(5\.\d+)\.  ([A-Z][A-Z0-9-]*)\n"):
    EXAMPLE_LINES.append((h.group(2), h.group(1), re.sub(r"\n   ABNF:\n.*?(?=\n   \S|\Z)", "\n", block, flags=re.S)))


# ---- The reference reader: RFC 6350 sections 3.3 and 3.4 ---------------------

LINE = re.compile(r'^(?:([A-Za-z0-9-]+)\.)?([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):(.*)$', re.S)


def split(value, sep):
    """At each separator a backslash does not escape."""
    out, cur, i = [], "", 0
    while i < len(value):
        if value[i] == "\\" and i + 1 < len(value):
            cur += value[i:i + 2]
            i += 2
            continue
        if value[i] == sep:
            out.append(cur)
            cur = ""
        else:
            cur += value[i]
        i += 1
    return out + [cur]


def unescape(value):
    return re.sub(r"\\([\\,;nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value)


READ_TYPES = {"text", "uri"}


def read_line(line):
    m = LINE.match(line)
    if not m:
        return None
    group, name, params_text, value = m.groups()
    name = name.upper()
    params = {}
    for p in re.finditer(r';([A-Za-z0-9-]+)=((?:"[^"]*"|[^";:]*)(?:,(?:"[^"]*"|[^";:,]*))*)', params_text):
        values = [v[1:-1] if v.startswith('"') else v for v in re.findall(r'"[^"]*"|[^,]+|(?<=,)(?=,)|^(?=,)', p.group(2))]
        params.setdefault(p.group(1).upper(), []).extend(values)
    # A quoted parameter value is one value (TYPE="voice,home" is two by 5.6's type-value list).
    if "TYPE" in params:
        params["TYPE"] = [t for v in params["TYPE"] for t in v.split(",")]
    entry = PROPERTIES.get(name, {})
    kind = (params.get("VALUE", [entry.get("default", "text")])[0]).lower()
    if entry.get("shape") == "structured":
        read = [[unescape(v) for v in split(c, ",")] if entry.get("components") == "list" else unescape(c) for c in split(value, ";")]
    elif kind == "text" and entry.get("shape") == "list":
        read = [unescape(v) for v in split(value, ",")]
    elif kind == "text":
        read = unescape(value)
    else:
        read = value
    out = {"name": name, "params": params, "type": kind, "value": read}
    if group:
        out["group"] = group
    return out


# ---- The examples chapter 6 gives, line by line -----------------------------

def example_lines(raw):
    """Each content line of an Examples block, its folded continuation joined (3.2)."""
    out, indent = [], None
    for line in raw.split("\n"):
        if not line.strip():
            indent = None if indent is None else indent
            continue
        lead = len(line) - len(line.lstrip(" "))
        body = line.strip()
        if out and indent is not None and lead > indent and not LINE.match(body) and not body.startswith(";"):
            out[-1] += line[indent + 1:]
            continue
        if re.match(r"^(?:[A-Za-z0-9-]+\.)?[A-Z][A-Z0-9-]*[;:]", body) and not body.startswith(";"):
            out.append(body)
            indent = lead
        else:
            indent = None
    return out


reserved = ORACLE["reserved"]


# The same rules as tools/oracle/gen.py: every mail address and URI host at a domain reserved
# for documentation (RFC 2606, 6761), every international number in PV-01's fictional range.
ADDRESS = re.compile(r"[A-Za-z0-9._%+!$&*=^`{|}~'-]+@([A-Za-z0-9.-]+)")
HOST = re.compile(r"\b[A-Za-z][A-Za-z0-9+.-]*://(?:[^/@\s]*@)?([A-Za-z0-9.-]+)")
PHONE = re.compile(r"(?<![A-Za-z0-9])\+([0-9][0-9 .()-]*)(?![A-Za-z0-9])")


FICTIONAL = "+1-555-555-0100"


def fictional(raw):
    """PV-01 keeps every real-looking number out of the repository: an international number
    outside its fictional range is written as the first number in that range, the rest of
    the example as the RFC gives it (the example's id still names where it came from)."""
    def one(m):
        digits = re.sub(r"\D", "", m.group(1))
        ok = not (digits[:1] in "123456789" and 8 <= len(digits) <= 15) or (len(digits) == 11 and digits.startswith("1") and digits[4:9] == "55501")
        return m.group(0) if ok else FICTIONAL
    return PHONE.sub(one, raw)


def documentation_only(raw):
    domains = [d.lower().rstrip(".") for d in ADDRESS.findall(raw) + HOST.findall(raw)]
    if not all(any(d == r or d.endswith("." + r) for r in reserved) for d in domains):
        return False
    for m in PHONE.finditer(raw):
        digits = re.sub(r"\D", "", m.group(1))
        if digits[:1] in "123456789" and 8 <= len(digits) <= 15 and not (len(digits) == 11 and digits.startswith("1") and digits[4:9] == "55501"):
            return False
    return True


examples, skipped = [], []
for name, section, raw in EXAMPLE_LINES:
    for i, line in enumerate(example_lines(raw), 1):
        ident = f"{STANDARD}-{section}-{i}"
        if "<..." in line:
            skipped.append({"id": ident, "why": "the RFC elides part of it"})
            continue
        line = fictional(line)
        if not documentation_only(line):
            skipped.append({"id": ident, "why": "an address outside the documentation domains"})
            continue
        read = read_line(line)
        if read is None:
            skipped.append({"id": ident, "why": "not a content line by RFC 6350 3.3"})
            continue
        examples.append({"id": ident, "section": section, "raw": line, "expect": read})


# ---- The registry rows RFC 6350 defines: its full inventory -----------------

def rows(reg_id):
    reg = registry.find(f"{NS}registry[@id='{reg_id}']")
    for rec in reg.findall(f"{NS}record"):
        refs = [x for x in rec.iter(f"{NS}xref") if x.get("type") == "rfc"]
        if not any(x.get("data") == STANDARD for x in refs):
            continue
        get = lambda tag: " ".join((rec.findtext(f"{NS}{tag}") or "").split())
        yield get, next(x.get("section") for x in refs if x.get("data") == STANDARD)


inventory = []
for get, sec in rows("properties"):
    inventory.append({"kind": "property", "name": get("description") or get("name"), "clause": sec})
for get, sec in rows("parameters"):
    inventory.append({"kind": "parameter", "name": get("description") or get("name"), "clause": sec})
for get, sec in rows("value-data-types"):
    inventory.append({"kind": "value-type", "name": get("name").lower(), "clause": sec})
for get, sec in rows("property-values"):
    inventory.append({"kind": "property-value", "name": f"{get('name')}:{get('description')}", "property": get("name"), "value": get("description"), "clause": sec})
for get, sec in rows("parameter-values"):
    props = [p.strip() for p in re.split(r",|\band\b", get("name")) if p.strip()]
    inventory.append({"kind": "parameter-value", "name": f"{get('description')}={get('value')}", "parameter": get("description"), "value": get("value"), "properties": props, "clause": sec})

# The ids ST-01's register gives the same rows (tools/standards/extract/iana_vcard.py).
import importlib.util
_ex = importlib.util.spec_from_file_location("iana_vcard", ROOT / "tools/standards/extract/iana_vcard.py")
iana_vcard = importlib.util.module_from_spec(_ex)
_ex.loader.exec_module(iana_vcard)
for entry in inventory:
    entry["id"] = iana_vcard.ident(STANDARD, entry["kind"], entry["name"], entry.get("properties", [None])[0] if entry["kind"] == "parameter-value" else None)


def exercised(entry, ex):
    e = ex["expect"]
    k = entry["kind"]
    if k == "property":
        return e["name"] == entry["name"]
    if k == "parameter":
        return entry["name"] in e["params"]
    if k == "value-type":
        return e["type"] == entry["name"]
    if k == "property-value":
        return e["name"] == entry["property"] and str(e["value"]).lower() == entry["value"].lower()
    return e["name"] in entry["properties"] and entry["value"].lower() in [v.lower() for v in e["params"].get(entry["parameter"], [])]


def derive(entry):
    """An example for a registry entry no RFC example exercises: the RFC's own example
    of a property it applies to, with that value put in."""
    if entry["kind"] == "parameter-value":
        for ex in examples:
            if ex["expect"]["name"] in entry["properties"] and not ex.get("from") and entry["parameter"] in PROPERTIES[ex["expect"]["name"]].get("params", []):
                m = LINE.match(ex["raw"])
                params = re.sub(rf";{entry['parameter']}=(\"[^\"]*\"|[^;:]*)", "", m.group(3), flags=re.I)
                line = f"{m.group(2)}{params};{entry['parameter']}={entry['value']}:{m.group(4)}"
                return line, ex["id"]
    # A parameter whose value "is the same as that of" a property (5.10 GEO, 5.11 TZ): that
    # property's example value, on an example of a property the parameter applies to.
    if entry["kind"] == "parameter" and entry["name"] in PROPERTIES:
        value = next((ex["raw"].split(":", 1)[1] for ex in examples if ex["expect"]["name"] == entry["name"] and "VALUE" not in ex["expect"]["params"]), None)
        for ex in examples:
            if value and not ex.get("from") and entry["name"] in PROPERTIES.get(ex["expect"]["name"], {}).get("params", []):
                m = LINE.match(ex["raw"])
                return f'{m.group(2)}{m.group(3)};{entry["name"]}="{value}":{m.group(4)}', ex["id"]
    if entry["kind"] == "property-value":
        for ex in examples:
            if ex["expect"]["name"] == entry["property"] and not ex.get("from"):
                m = LINE.match(ex["raw"])
                return f"{m.group(2)}{m.group(3)}:{entry['value']}", ex["id"]
    return None


for entry in inventory:
    if entry["kind"] in ("parameter", "parameter-value", "property-value") and not any(exercised(entry, ex) for ex in examples):
        got = derive(entry)
        if got:
            line, origin = got
            examples.append({"id": f"{STANDARD}-{entry['kind']}-{entry['name']}", "section": entry["clause"], "raw": line, "from": origin, "expect": read_line(line)})

debt = {d["name"]: d for d in SPEC.get("debt", [])}
unmet = []
for entry in inventory:
    k, n = entry["kind"], entry["name"]
    entry["implemented"] = {
        "property": n in PROPERTIES,
        "parameter": n in PARAMETERS,
        # Text is read to its escapes and separators (3.4) and a URI is its text; every other
        # value type is read only once its section 4 grammar checks it.
        "value-type": n in READ_TYPES,
        "property-value": entry.get("property") in PROPERTIES,
        "parameter-value": entry.get("parameter") in PARAMETERS,
    }[k]
    entry["examples"] = [ex["id"] for ex in examples if exercised(entry, ex)]
    met = entry["implemented"] and entry["examples"]
    key = f"{k} {n}"
    if met and key in debt:
        refuse(f"debt lists {key}, which is now implemented and exercised: remove it")
    if not met and key not in debt:
        unmet.append(f"{k} {n} ({entry['clause']}): {'not implemented' if not entry['implemented'] else 'exercised by no example'}")
if unmet:
    refuse("RFC 6350 registry entries neither met nor in debt:\n  " + "\n  ".join(unmet))
for key, d in debt.items():
    if not str(d.get("why", "")).strip():
        refuse(f"debt {key} gives no reason")
    if not any(f"{e['kind']} {e['name']}" == key for e in inventory):
        refuse(f"debt {key} is not an RFC 6350 registry entry")

# ---- Written out -------------------------------------------------------------

table = "\n".join([
    "// Generated by tools/oracle/vcard.py from RFC 6350 (its ABNF) and IANA's vCard",
    "// Elements registry, both pinned in app/specs/oracle/vcard.json. Do not edit.",
    f"export const PROPERTIES = {json.dumps(PROPERTIES, separators=(',', ':'))};",
    f"export const PARAMETERS = {json.dumps(PARAMETERS, separators=(',', ':'))};",
    "",
])
out = json.dumps({"comment": "Generated by tools/oracle/vcard.py from app/specs/oracle/vcard.json. Do not edit.",
                  "standard": STANDARD, "inventory": inventory, "examples": examples, "skipped": skipped}, indent=1, ensure_ascii=False) + "\n"
# The suite that enforces each met entry for ST-01: its examples, read by the page's reader.
SUITE = ROOT / "test/vcard.registry.test.mjs"
suite = "\n".join([
    "// Generated by tools/oracle/vcard.py from app/specs/oracle/vcard.json. Do not edit.",
    "// Each test enforces one element of IANA's vCard Elements registry (ST-01): the",
    "// example lines that exercise it read, through site/read/vcard.mjs, as RFC 6350 reads them.",
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    'import test from "node:test";',
    'import { readLine } from "../site/read/vcard.mjs";',
    "",
    'const examples = new Map(JSON.parse(readFileSync("test/oracle/vcard.json", "utf8")).examples.map((e) => [e.id, e]));',
    "const reads = (id) => assert.deepEqual(readLine(examples.get(id).raw), examples.get(id).expect, id);",
    "",
] + [f"// enforces: {e['id']}\ntest({json.dumps(e['kind'] + ' ' + e['name'])}, () => {json.dumps(e['examples'])}.forEach(reads));" for e in inventory if e["implemented"] and e["examples"]] + [""])
if "--check" in args:
    if not SUITE.exists() or SUITE.read_text(encoding="utf-8") != suite:
        refuse("test/vcard.registry.test.mjs is stale: run python3 -I tools/oracle/vcard.py")
    if not TABLE.exists() or TABLE.read_text(encoding="utf-8") != table:
        refuse("site/read/vcard.table.mjs is stale: run python3 -I tools/oracle/vcard.py")
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != out:
        refuse("test/oracle/vcard.json is stale: run python3 -I tools/oracle/vcard.py")
    sys.exit(0)
TABLE.write_text(table, encoding="utf-8")
SUITE.write_text(suite, encoding="utf-8")
OUT.write_text(out, encoding="utf-8")
met = sum(1 for e in inventory if e["implemented"] and e["examples"])
print(f"vcard: {len(PROPERTIES)} properties, {len(PARAMETERS)} parameters; {met} of {len(inventory)} RFC 6350 registry entries implemented and exercised by {len(examples)} examples ({sum(1 for e in examples if e.get('from'))} derived), {len(debt)} in debt, {len(skipped)} example lines skipped")
