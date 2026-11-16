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
either if stale. Every source is read from
app/specs/standards/texts/<sha256>, never from the network; --fetch keeps a pin that is not kept yet.

usage: python3 -I tools/oracle/vcard.py [--check] [--fetch]
"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "standards"))
import abnf  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/oracle/vcard.json").read_text(encoding="utf-8"))
ORACLE = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
TABLE = ROOT / "site/read/vcard.table.mjs"
OUT = ROOT / "test/oracle/vcard.json"
args = sys.argv[1:]
TEXTS = ROOT / "app/specs/standards/texts"
STANDARD = SPEC["standard"]


def refuse(why):
    sys.exit(f"vcard: {why}")


def fetch(source, headers={}):
    return abnf.kept_bytes(source["url"], source["sha256"], TEXTS, refuse, "--fetch" in args, headers).decode("utf-8")


source = {s["key"]: s for s in SPEC["sources"]}
rfc = SPEC["sources"][0]
pinned = next((json.loads(p.read_text(encoding="utf-8")) for p in (ROOT / "app/specs/oracle/sources").glob(rfc["key"] + ".json")), None)
if not pinned or pinned["sha256"] != rfc["sha256"]:
    refuse(f"{rfc['key']} must be the source app/specs/oracle/sources/ pins, at the same sha256")
text = abnf.unpaginate(fetch(rfc), examples=True)
registry = ET.fromstring(fetch(source["iana-vcard"]))
NS = "{http://www.iana.org/assignments}"


# ---- RFC 6350's grammar, as its ABNF blocks state it -------------------------

def abnf_rules(block, header=r"ABNF:"):
    """name -> definition, continuation lines joined, comments dropped."""
    rules, current = {}, None
    m = re.search(rf"\n   {header}[^\n]*\n(.*?)(?=\n   [A-Z][a-z]+( [a-z]+)*(\(s\))?:?[ \t]*\n|\n   [A-Z][a-z]+( [a-z]+)*(\(s\))?:|\Z)", block, re.S)
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
        EXAMPLE_LINES.append((STANDARD, name, section, m.group(1)))
# Chapter 5 shows each parameter on the properties it applies to, in its prose as well as
# under "Examples": every indented content line outside its ABNF.
for h, block in section_blocks(chapter5, r"^(5\.\d+)\.  ([A-Z][A-Z0-9-]*)\n"):
    EXAMPLE_LINES.append((STANDARD, h.group(2), h.group(1), re.sub(r"\n   ABNF:\n.*?(?=\n   \S|\Z)", "\n", block, flags=re.S)))


# ---- The RFCs that extend it, each by RFC 6350 section 10.2.1's template -----
# A property section names "Property name:", its "Value type:", "Cardinality:",
# "Property parameters:" and "Format definition:" (ABNF); a parameter section
# "Parameter name:" and its format; a value section "Value:". Every section's
# "Example(s):" lines are examples, the RFC's updates to RFC 6350 properties among them.
EXTENSIONS = {}
for src in SPEC["sources"]:
    if src.get("extends") != STANDARD:
        continue
    t = abnf.unpaginate(fetch(src), examples=True)
    for erratum in src.get("errata", []):
        if t.count(erratum["says"]) != 1:
            refuse(f"{src['key']} erratum {erratum['id']} is not text it holds once")
        t = t.replace(erratum["says"], erratum["should"])
    EXTENSIONS[src["key"]] = t
    for h, block in section_blocks(t, r"^(\d+(?:\.\d+)*)\.  (.+)\n"):
        section = h.group(1)
        field = lambda f: (re.search(rf"\n   {f}:[ \t]*(.*?)(?=\n\n|\n   [A-Z][A-Za-z ()]*:)", "\n" + block, re.S) or [None, None])[1]
        rules = abnf_rules(block, r"(?:ABNF:?|Format definition:)")
        for tok, pname in [(m.group(1), m.group(2) or m.group(3)) for m in re.finditer(r'^\s+([A-Za-z-]+)\s*=\s*(?:"([A-Z-]+)="|"([A-Z-]+)"\s*"=")', block, re.M)]:
            PARAM_TOKEN.setdefault(tok.lower(), pname)
        pname = field("Parameter name")
        if pname and pname.split()[0] not in PARAMETERS:
            PARAMETERS[pname.split()[0]] = {"section": section, "rfc": src["key"]}
        name = field("Property name")
        if name:
            name = name.split()[0]
            lower = {k.lower(): v for k, v in rules.items()}
            value = lower.get(f"{name.lower()}-value")
            if value is None:
                top = next((v for v in rules.values() if v.startswith(f'"{name}"')), None)
                if top is None or '":"' not in top:
                    refuse(f"{src['key']} {section} {name} has no value rule")
                value = top.split('":"', 1)[1].strip()
            lrules = {**rules, **{k.lower(): v for k, v in rules.items()}}
            alts = alternatives(value)
            first = alts[0].split()[0]
            entry = {"section": section, "rfc": src["key"], **({"cardinality": field("Cardinality").split()[0]} if field("Cardinality") else {}), "default": type_of(first, lrules)}
            if '";"' in value:
                entry["shape"] = "structured"
            elif first.lower() == "text-list":
                entry["shape"] = "list"
            param_text = " ".join(v for k, v in rules.items() if k.lower().startswith(name.lower() + "-param"))
            types = sorted({w.lower() for g in re.findall(r'"VALUE"\s*"="\s*(\([^)]*\)|"[^"]*")|"VALUE="\s*(\([^)]*\)|"[^"]*")', param_text) for part in g for w in re.findall(r'"([A-Za-z-]+)"', part)})
            if types:
                entry["types"] = types
            listed = re.sub(r"\([^)]*\)", "", field("Property parameters") or "")
            params = {w for w in re.findall(r"\b[A-Z][A-Z0-9-]+\b", listed)}
            params |= {PARAM_TOKEN[t.lower()] for t in re.findall(r"[a-z][a-z0-9-]*-param(?:eter)?", param_text) if t.lower() in PARAM_TOKEN}
            if params:
                entry["params"] = sorted(params)
            enum = [a.strip('"') for a in alts if a.startswith('"')]
            if enum:
                entry["values"] = enum
            PROPERTIES.setdefault(name, entry)
        m = re.search(r"\n   Examples?(?:\(s\))?:?[ \t]*(.*)$", block, re.S)
        if m:
            EXAMPLE_LINES.append((src["key"], (name or pname or h.group(2)).split()[0], section, m.group(1)))


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
    return {**({"group": group} if group else {}), "name": name, "params": params, "type": kind, "value": read}


# ---- The examples chapter 6 gives, line by line -----------------------------

def example_lines(raw):
    """Each content line of an Examples block with its folded continuations (3.2), as written."""
    out, indent = [], None
    for line in raw.split("\n"):
        if not line.strip():
            continue
        lead = len(line) - len(line.lstrip(" "))
        body = line.strip()
        # A comment (";" and a space) or a figure's caption ends the example; it continues nothing.
        comment = re.match(r"^;\s|^Figure \d+:", body)
        if out and indent is not None and lead > indent and not LINE.match(body) and not comment:
            out[-1].append(line[indent:])
            continue
        # A display wrap at the line's own indent: a run with no space that starts no content line.
        if out and indent is not None and lead == indent and not re.search(r"\s", body) and not re.match(r"^(?:[A-Za-z0-9-]+\.)?[A-Z][A-Z0-9-]*[;:]", body):
            out[-1].append(" " + body)
            continue
        if re.match(r"^(?:[A-Za-z0-9-]+\.)?[A-Z][A-Z0-9-]*[;:]", body) and not comment:
            out.append([body])
            indent = lead
        else:
            indent = None
    return out


def unfold(parts):
    """A folded line unfolds by removing each line break and the one space after it (3.2). An
    RFC's display indents a continuation further, so where that does not give a content line,
    the reading that does is the one with the display indent removed."""
    once = parts[0] + "".join(c[1:] for c in parts[1:])
    return once if read_line(once) is not None else parts[0] + "".join(c.lstrip() for c in parts[1:])


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
for rfc_key, name, section, raw in EXAMPLE_LINES:
    for i, parts in enumerate(example_lines(raw), 1):
        ident = f"{rfc_key}-{section}-{i}"
        # Where the RFC elides the rest of a value (<...remainder...>), the line is read as far as it is given.
        whole = [p for p in parts if "<..." not in p]
        elided = len(whole) < len(parts) or "<..." in parts[0]
        if "<..." in whole[0] if whole else True:
            skipped.append({"id": ident, "why": "the RFC elides the line itself"})
            continue
        line = fictional(unfold(whole))
        if not documentation_only(line):
            skipped.append({"id": ident, "why": "an address outside the documentation domains"})
            continue
        read = read_line(line)
        if read is None:
            skipped.append({"id": ident, "why": "not a content line by RFC 6350 3.3"})
            continue
        examples.append({"id": ident, "rfc": rfc_key, "section": section, "raw": line, **({"elided": True} if elided else {}), "expect": read})


# ---- The registry rows RFC 6350 defines: its full inventory -----------------

RFCS = [STANDARD, *EXTENSIONS]


def rows(reg_id):
    """Every row of a registry, with the RFC that defines it: RFC 6350 where it does, else the
    first RFC it cites (pinned or not: a row whose RFC is not pinned must be in debt)."""
    reg = registry.find(f"{NS}registry[@id='{reg_id}']")
    for rec in reg.findall(f"{NS}record"):
        refs = [x for x in rec.iter(f"{NS}xref") if x.get("type") == "rfc"]
        get = lambda tag: " ".join((rec.findtext(f"{NS}{tag}") or "").split())
        ref = next((x for x in refs if x.get("data") == STANDARD), None)
        ref = ref if ref is not None else next((x for x in refs if x.get("data") in RFCS), refs[0])
        yield get, ref.get("section"), ref.get("data")


inventory = []
for get, sec, std in rows("properties"):
    inventory.append({"kind": "property", "name": get("description") or get("name"), "standard": std, "clause": sec})
for get, sec, std in rows("parameters"):
    inventory.append({"kind": "parameter", "name": get("description") or get("name"), "standard": std, "clause": sec})
for get, sec, std in rows("value-data-types"):
    inventory.append({"kind": "value-type", "name": get("name").lower(), "standard": std, "clause": sec})
for get, sec, std in rows("property-values"):
    inventory.append({"kind": "property-value", "name": f"{get('name')}:{get('description')}", "property": get("name"), "value": get("description"), "standard": std, "clause": sec})
for get, sec, std in rows("parameter-values"):
    props = [p.strip() for p in re.split(r",|\band\b", get("name")) if p.strip()]
    inventory.append({"kind": "parameter-value", "name": f"{get('description')}={get('value')}", "parameter": get("description"), "value": get("value"), "properties": props, "standard": std, "clause": sec})

# The ids ST-01's register gives the same rows (tools/standards/extract/iana_vcard.py).
import importlib.util
_ex = importlib.util.spec_from_file_location("iana_vcard", ROOT / "tools/standards/extract/iana_vcard.py")
iana_vcard = importlib.util.module_from_spec(_ex)
_ex.loader.exec_module(iana_vcard)
for entry in inventory:
    entry["id"] = iana_vcard.ident(entry["standard"], entry["kind"], entry["name"], entry.get("properties", [None])[0] if entry["kind"] == "parameter-value" else None)


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
            # The registry row names the properties the value applies to.
            if ex["expect"]["name"] in entry["properties"] and not ex.get("from"):
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
            examples.append({"id": f"{entry['standard']}-{entry['kind']}-{entry['name']}" + (f"-{entry['properties'][0]}" if entry["kind"] == "parameter-value" else ""), "rfc": entry["standard"], "section": entry["clause"], "raw": line, "from": origin, "expect": read_line(line)})

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
    refuse("vCard registry entries neither met nor in debt:\n  " + "\n  ".join(unmet))
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
    "// example lines that exercise it read, through the page's LexLean reader (app/src/PrismVcard), as RFC 6350 reads them.",
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    'import test from "node:test";',
    'import { GUESTS, openGuest } from "../site/read/guest.mjs";',
    "",
    'const examples = new Map(JSON.parse(readFileSync("test/oracle/vcard.json", "utf8")).examples.map((e) => [e.id, e]));',
    'const guest = await openGuest(readFileSync(new URL(GUESTS.vcard.path, new URL("../site/read/", import.meta.url))), GUESTS.vcard.sha256);',
    "const reads = async (ids) => { for (const id of ids) assert.equal(await guest(`line\\n${examples.get(id).raw}`), JSON.stringify(examples.get(id).expect), id); };",
    "",
] + [f"// enforces: {e['id']}\ntest({json.dumps(e['kind'] + ' ' + e['name'])}, () => reads({json.dumps(e['examples'])}));" for e in inventory if e["implemented"] and e["examples"]] + [""])
OUTPUTS = {SUITE: suite, TABLE: table, OUT: out}
if "--check" in args:
    for path, text in OUTPUTS.items():
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            refuse(f"{path.relative_to(ROOT)} is stale: run python3 -I tools/oracle/vcard.py")
    sys.exit(0)
for path, text in OUTPUTS.items():
    path.parent.mkdir(exist_ok=True)
    path.write_text(text, encoding="utf-8")
met = sum(1 for e in inventory if e["implemented"] and e["examples"])
print(f"vcard: {len(PROPERTIES)} properties, {len(PARAMETERS)} parameters from {len(RFCS)} RFCs; {met} of {len(inventory)} vCard registry entries implemented and exercised by {len(examples)} examples ({sum(1 for e in examples if e.get('from'))} derived), {len(debt)} in debt, {len(skipped)} example lines skipped")
