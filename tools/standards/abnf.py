"""A specification's own grammar, taken from its pinned text as data.

ABNF (RFC 5234, with RFC 7405's %s and %i) is read out of an RFC's plain
text: every rule definition ("name = elements" or "name =/ elements"), with
its continuation lines and without its comments, under the section it is
defined in. RFC 822's notation (":=" in RFC 2045 and RFC 2046) is read the same
way. Each rule is parsed by RFC 5234 section 4's own grammar into a node:

    ["alt", n, ...]   alternatives, in the order written
    ["seq", n, ...]   concatenation
    ["rep", min, max, n]   repetition (max None: no limit)
    ["ref", name]     another rule, by its lower-cased name
    ["lit", text]     a quoted string, case-insensitive (RFC 5234 2.3)
    ["cs", text]      %s"...", case-sensitive (RFC 7405)
    ["range", lo, hi] %x41-5A, inclusive
    ["prose", text]   <...>, which no machine can match unless bound

A grammar is the rules of one or more pinned texts; a rule defined twice must
be defined the same way, an "=/" adds alternatives, and every rule referred to
must be defined, bound or imported, or the grammar is refused.
"""
import re

PAGE_FOOT = re.compile(r"\[Page \d+\]\s*$")


def unpaginate(text):
    """The RFC's text without its page breaks: footer, form feed, header and the padding around them."""
    lines = text.replace("\r\n", "\n").split("\n")
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("\f"):
            while out and not out[-1].strip():
                out.pop()
            if out and PAGE_FOOT.search(out[-1]):
                out.pop()
            while out and not out[-1].strip():
                out.pop()
            i += 1
            if i < len(lines) and lines[i].startswith("RFC "):
                i += 1
            while i < len(lines) and not lines[i].strip():
                i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


SECTION = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+\S|^(?:Appendix )?([A-Z](?:\.\d+)*)\.?\s+\S")
START = re.compile(r"^(\s*)([A-Za-z][A-Za-z0-9-]*)\s*(=/|:=|=)(?=\s|$)(.*)$")


def strip_comment(line):
    """A line without its ";" comment, a ";" inside a quoted string or <prose> kept."""
    out, quote = [], None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch == '"':
            quote = '"'
            out.append(ch)
        elif ch == "<":
            quote = ">"
            out.append(ch)
        elif ch == ";":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def definitions(text, sections=None):
    """Each rule definition in the text: (name, op, elements, section), in order.

    sections, when given, limits it to definitions under those section
    numbers (a prefix: "3.6" takes 3.6.1 too)."""
    lines = unpaginate(text).split("\n")
    section = ""
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        head = SECTION.match(line)
        if head:
            section = head.group(1) or head.group(2)
            i += 1
            continue
        m = START.match(line)
        if not m or not m.group(1):
            i += 1
            continue
        indent = len(m.group(1))
        body = [strip_comment(m.group(4))]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if not nxt.strip():
                # A blank line ends a rule, unless the next line goes on with its elements, deeper than its name.
                j = i + 1
                if j < len(lines) and lines[j].strip() and len(lines[j]) - len(lines[j].lstrip()) > indent and not START.match(lines[j]) and re.match(r"^\s*[/\[(\"%<*0-9A-Za-z]", lines[j]) and body and body[-1].rstrip().endswith("/"):
                    i = j
                    continue
                break
            lead = len(nxt) - len(nxt.lstrip())
            if lead <= indent or START.match(nxt) and lead <= indent + 2:
                break
            body.append(strip_comment(nxt))
            i += 1
        elements = " ".join(b.strip() for b in body).strip()
        if not elements:
            continue
        if sections and not any(section == s or section.startswith(s + ".") for s in sections):
            continue
        out.append((m.group(2).lower(), m.group(3), elements, section))
    return out


class Bad(Exception):
    pass


TOKEN = re.compile(r"""
    \s+
  | (?P<rulename>[A-Za-z][A-Za-z0-9-]*)
  | (?P<rep>\d*\*\d*|\d+)
  | (?P<cs>%[sS]"[^"]*")
  | (?P<ci>(?:%[iI])?"[^"]*")
  | (?P<num>%[xX][0-9A-Fa-f]+(?:(?:\.[0-9A-Fa-f]+)+|-[0-9A-Fa-f]+)?|%[dD]\d+(?:(?:\.\d+)+|-\d+)?|%[bB][01]+(?:(?:\.[01]+)+|-[01]+)?)
  | (?P<prose><[^>]*>)
  | (?P<punct>[/()\[\]])
""", re.X)


def tokens(text):
    pos, out = 0, []
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m or m.end() == pos:
            raise Bad(f"cannot read {text[pos:pos + 20]!r}")
        pos = m.end()
        kind = m.lastgroup
        if kind:
            out.append((kind, m.group(kind)))
    return out


def number(tok):
    base = {"x": 16, "d": 10, "b": 2}[tok[1].lower()]
    body = tok[2:]
    if "-" in body:
        lo, hi = body.split("-")
        return ["range", int(lo, base), int(hi, base)]
    codes = [int(p, base) for p in body.split(".")]
    if len(codes) == 1:
        return ["range", codes[0], codes[0]]
    return ["seq", *(["range", c, c] for c in codes)]


def parse(text, notation="5234"):
    """One rule's elements as a node (RFC 5234 section 4: alternation, concatenation, repetition, element)."""
    toks = tokens(text)
    at = 0

    def peek():
        return toks[at] if at < len(toks) else (None, None)

    def take():
        nonlocal at
        at += 1
        return toks[at - 1]

    def alternation():
        alts = [concatenation()]
        while peek() == ("punct", "/"):
            take()
            alts.append(concatenation())
        return alts[0] if len(alts) == 1 else ["alt", *alts]

    def concatenation():
        items = []
        while True:
            kind, value = peek()
            if kind is None or value in ("/", ")", "]"):
                break
            items.append(repetition())
        if not items:
            raise Bad("an empty concatenation")
        return items[0] if len(items) == 1 else ["seq", *items]

    def repetition():
        kind, value = peek()
        lo, hi = 1, 1
        if kind == "rep":
            take()
            if "*" in value:
                a, b = value.split("*")
                lo = int(a) if a else 0
                hi = int(b) if b else None
            else:
                lo = hi = int(value)
        node = element()
        return node if (lo, hi) == (1, 1) else ["rep", lo, hi, node]

    def element():
        kind, value = take()
        if kind == "rulename":
            return ["ref", value.lower()]
        if kind == "punct" and value == "(":
            node = alternation()
            if take() != ("punct", ")"):
                raise Bad("an unclosed group")
            return node
        if kind == "punct" and value == "[":
            node = alternation()
            if take() != ("punct", "]"):
                raise Bad("an unclosed option")
            return ["rep", 0, 1, node]
        if kind == "cs":
            return ["cs", value[3:-1]]
        if kind == "ci":
            return ["lit", value[value.index('"') + 1:-1]]
        if kind == "num":
            return number(value)
        if kind == "prose":
            return ["prose", " ".join(value[1:-1].split())]
        raise Bad(f"an unexpected {value!r}")

    node = alternation()
    if at != len(toks):
        raise Bad(f"left over: {toks[at:]}")
    return node


def refs(node, out=None):
    out = set() if out is None else out
    if node[0] == "ref":
        out.add(node[1])
    elif node[0] in ("alt", "seq"):
        for n in node[1:]:
            refs(n, out)
    elif node[0] == "rep":
        refs(node[3], out)
    return out


def norm(node):
    return repr(node)


def grammar(texts, bindings=None):
    """The rules of the given texts, each (key, text, sections or None, notation).

    Returns {"rules": {name: node}, "from": {name: "key section"}}; bindings
    ({name: [elements, why]}) give a rule a machine-matchable definition where
    its specification states it in prose, and must each be used."""
    rules, origin = {}, {}
    for key, text, sections in texts:
        for name, op, elements, section in definitions(text, sections):
            try:
                node = parse(elements)
            except Bad as why:
                raise Bad(f"{key} {section} {name}: {why}") from None
            if op == "=/":
                if name not in rules:
                    raise Bad(f"{key} {section} {name} adds to a rule not yet defined")
                old = rules[name]
                rules[name] = ["alt", *(old[1:] if old[0] == "alt" else [old]), node]
                origin[name] = f"{origin[name]}, {key} {section}"
                continue
            if name in rules:
                if norm(rules[name]) != norm(node):
                    raise Bad(f"{name} is defined twice, differently ({origin[name]} and {key} {section})")
                continue
            rules[name] = node
            origin[name] = f"{key} {section}"
    for name, (elements, why) in (bindings or {}).items():
        if not why:
            raise Bad(f"binding {name} gives no reason")
        if rules.get(name, ["prose"])[0] != "prose":
            raise Bad(f"binding {name} replaces a rule its specification already states in ABNF")
        rules[name] = parse(elements)
        origin[name] = f"bound: {why}"
    missing = sorted({r for n in rules.values() for r in refs(n)} - set(rules))
    if missing:
        raise Bad(f"rules referred to and not defined: {missing}")
    return {"rules": rules, "from": origin}


def shortest(rules):
    """The shortest text each rule derives (None where none can be written: prose)."""
    best = {}

    def of(node):
        kind = node[0]
        if kind == "ref":
            return best.get(node[1])
        if kind in ("lit", "cs"):
            return node[1]
        if kind == "range":
            return chr(node[1])
        if kind == "prose":
            return None
        if kind == "alt":
            found = [s for s in (of(n) for n in node[1:]) if s is not None]
            return min(found, key=len) if found else None
        if kind == "seq":
            parts = [of(n) for n in node[1:]]
            return None if any(p is None for p in parts) else "".join(parts)
        if kind == "rep":
            if node[1] == 0:
                return ""
            s = of(node[3])
            return None if s is None else s * node[1]
        raise Bad(f"unknown node {kind}")

    changed = True
    while changed:
        changed = False
        for name, node in rules.items():
            s = of(node)
            if s is not None and (name not in best or len(s) < len(best[name])):
                best[name] = s
                changed = True
    return best


def witnesses(rules, target, short=None):
    """For each rule, the shortest text it derives through target, and where in it target's own text lies: {rule: (text, start, end)}."""
    short = short or shortest(rules)
    best = {}

    def of(node):
        kind = node[0]
        if kind == "ref":
            if node[1] == target and node[1] in short:
                return (short[target], 0, len(short[target]))
            return best.get(node[1])
        if kind in ("lit", "cs", "range", "prose"):
            return None
        if kind == "alt":
            found = [w for w in (of(n) for n in node[1:]) if w]
            return min(found, key=lambda w: len(w[0])) if found else None
        if kind == "seq":
            items = node[1:]
            plain = [short_of(n) for n in items]
            found = []
            for i, n in enumerate(items):
                w = of(n)
                if not w or any(p is None for j, p in enumerate(plain) if j != i):
                    continue
                before = "".join(plain[:i])
                found.append((before + w[0] + "".join(plain[i + 1:]), len(before) + w[1], len(before) + w[2]))
            return min(found, key=lambda w: len(w[0])) if found else None
        if kind == "rep":
            if node[2] == 0:
                return None
            w = of(node[3])
            s = short_of(node[3])
            if not w or (node[1] > 1 and s is None):
                return None
            rest = s * max(node[1] - 1, 0) if s is not None else ""
            return (w[0] + rest, w[1], w[2])
        raise Bad(f"unknown node {kind}")

    def short_of(node):
        kind = node[0]
        if kind == "ref":
            return short.get(node[1])
        if kind in ("lit", "cs"):
            return node[1]
        if kind == "range":
            return chr(node[1])
        if kind == "prose":
            return None
        if kind == "alt":
            found = [s for s in (short_of(n) for n in node[1:]) if s is not None]
            return min(found, key=len) if found else None
        if kind == "seq":
            parts = [short_of(n) for n in node[1:]]
            return None if any(p is None for p in parts) else "".join(parts)
        if kind == "rep":
            if node[1] == 0:
                return ""
            s = short_of(node[3])
            return None if s is None else s * node[1]

    changed = True
    while changed:
        changed = False
        for name, node in rules.items():
            w = (short[name], 0, len(short[name])) if name == target and name in short else of(node)
            if w and (name not in best or len(w[0]) < len(best[name][0])):
                best[name] = w
                changed = True
    return best
