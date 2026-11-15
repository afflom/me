"""RFC 5545 section 3 as data: each element's definition, read from the RFC's own text.

The RFC defines every parameter (3.2), value type (3.3), component (3.6) and
property (3.7, 3.8) in one shape: a heading, then labelled fields ("Property
Name:", "Value Type:", "Conformance:", "Format Definition:", "Example:").
This reads those fields as they are written:
  - name: the element's name (Parameter Name, Value Name, Component Name, Property Name);
  - types: the value types its "Value Type:" names, the default first;
  - within: the components its "Conformance:" names;
  - many: its Format Definition lets one property hold several values (*("," ...));
  - members: for a component, each property its Format Definition names, and how
    often it may occur, from the grammar's own comments (REQUIRED or OPTIONAL,
    once or more than once);
  - examples: the indented content lines under its "Example:".
"""
import re

LABELS = ("Parameter Name", "Value Name", "Component Name", "Property Name", "Purpose", "Value Type", "Property Parameters",
          "Conformance", "Description", "Format Definition", "Example", "Examples")


def section3(text):
    """The text of section 3, from its heading to section 4's, without the table of contents."""
    lines = text.split("\n")
    heads = [i for i, l in enumerate(lines) if l.startswith("3.  iCalendar Object Specification")]
    ends = [i for i, l in enumerate(lines) if l.startswith("4.  iCalendar Object Examples")]
    if not heads or not ends:
        raise ValueError("rfc5545 has no section 3")
    return lines[heads[-1] : ends[-1]]


def fields(block):
    """A definition's labelled fields: label -> its lines, as written."""
    out, label = {}, None
    for line in block:
        m = re.match(r"^   (" + "|".join(LABELS) + r"):\s*(.*)$", line)
        if m:
            label = m.group(1)
            out.setdefault(label, [])
            if m.group(2):
                out[label].append(m.group(2))
            continue
        if label:
            out[label].append(line)
    return out


def words(lines):
    return re.sub(r"\s+", " ", " ".join(l.strip() for l in lines)).strip()


def examples(lines):
    """The content lines an Example shows, unfolded as section 3.1 folds them.

    An example line is indented and reads NAME[;params]:value. The RFC shows a
    long line folded: each continuation is indented one more than the line it
    continues, that one space being the fold (3.1), so what follows it is the
    value's own text, spaces and all. A note after a value ("; Local time") is
    the RFC's comment on the example, not part of it.
    """
    out, base = [], None
    for line in lines:
        if not line.strip():
            base = None if out and not line.strip() else base
            continue
        indent = len(line) - len(line.lstrip(" "))
        body = line.strip()
        if body.startswith(";"):
            continue
        if indent >= 5 and re.match(r"^[A-Z][A-Z0-9-]*[;:]", body) and (base is None or indent <= base):
            out.append(re.sub(r"\s{2,};.*$", "", line[indent:]))
            base = indent
        elif base is not None and indent > base and out:
            out[-1] += re.sub(r"\s{2,};.*$", "", line[base + 1 :])
    return out


def definitions(text, value_types):
    """Every element section 3 defines, by section number."""
    body = section3(text)
    heads = [(i, m.group(1), m.group(2)) for i, l in enumerate(body) if (m := re.match(r"^(3\.\d+(?:\.\d+)*)\.\s+(.+)$", l))]
    out = {}
    for n, (i, number, title) in enumerate(heads):
        block = body[i + 1 : heads[n + 1][0] if n + 1 < len(heads) else len(body)]
        f = fields(block)
        kind = next((k for label, k in (("Property Name", "property"), ("Component Name", "component"), ("Parameter Name", "parameter"), ("Value Name", "value")) if label in f), None)
        if not kind:
            continue
        label = {"property": "Property Name", "component": "Component Name", "parameter": "Parameter Name", "value": "Value Name"}[kind]
        name = words(f[label]).split()[0].strip('"')
        entry = {"section": number, "title": title.strip(), "kind": kind, "name": name}
        grammar = "\n".join(f.get("Format Definition", []))
        if kind == "property":
            said = words(f.get("Value Type", []))
            named = [t for t in re.findall(r"\b([A-Z][A-Z-]+[A-Z])\b", said) if t in value_types]
            default = re.search(r"default value type is ([A-Z-]+)", said)
            types = ([default.group(1)] if default else []) + [t for t in named if not default or t != default.group(1)]
            entry["types"] = list(dict.fromkeys(types))
            entry["within"] = list(dict.fromkeys(re.findall(r'"(V[A-Z]+|STANDARD|DAYLIGHT)"', words(f.get("Conformance", [])))))
            entry["many"] = bool(re.search(r'\*\(\s*","', grammar))
            # A value of parts (GEO's two floats, REQUEST-STATUS's code and text): its grammar joins them with ";".
            # The property's own rule, to the blank line; its value is what follows its last ":".
            own = re.search(r'(?m)^\s*[a-z][a-z-]*\s*=\s*"' + re.escape(name) + r'"(.*?)(?:\n\s*\n|\Z)', grammar, re.S)
            after = own.group(1).rsplit('":"', 1)[-1] if own else ""
            first = re.match(r"\s*([a-z][a-z-]*)", after)
            sub = first and re.search(r"(?m)^\s*" + re.escape(first.group(1)) + r"\s*=(.*?)(?:\n\s*\n|\Z)", grammar, re.S)
            entry["parts"] = '";"' in after or bool(sub and '";"' in sub.group(1))
        if kind == "component":
            entry["members"] = members(grammar)
        shown = examples(f.get("Example", []) + f.get("Examples", []))
        if kind == "component":
            # A component's example is a whole object, BEGIN to END.
            entry["examples"] = objects(shown)
        else:
            entry["examples"] = [line for line in shown if not line.startswith(("BEGIN:", "END:"))]
        out[number] = entry
    return out


def objects(shown):
    """Whole objects among example lines: each BEGIN to its matching END, as CRLF content lines."""
    out, depth, current = [], 0, []
    for line in shown:
        if line.startswith("BEGIN:"):
            depth += 1
        if depth:
            current.append(line)
        if line.startswith("END:"):
            depth -= 1
            if depth == 0 and current:
                out.append("\r\n".join(current) + "\r\n")
                current = []
    return out


def members(grammar):
    """A component's properties and how often each may occur, from its grammar's own comments."""
    out, rule = {}, None
    for line in grammar.split("\n"):
        text = line.strip()
        if text.startswith(";"):
            said = text.lstrip("; ").upper()
            if "REQUIRED" in said or "OPTIONAL" in said:
                rule = {"required": "REQUIRED" in said and "OPTIONAL" not in said}
            if "MUST NOT OCCUR MORE THAN ONCE" in said and rule is not None:
                rule["once"] = True
            if "MAY OCCUR MORE THAN ONCE" in said and rule is not None:
                rule["once"] = False
            continue
        for name in re.findall(r"\b([a-z][a-z-]*)\b", text):
            if rule is not None and name not in ("x", "iana", "prop", "comp"):
                out.setdefault(name, dict(rule))
    return out
