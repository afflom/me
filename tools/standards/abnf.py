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


def prose_in(node):
    if node[0] == "prose":
        return True
    if node[0] in ("alt", "seq"):
        return any(prose_in(n) for n in node[1:])
    return node[0] == "rep" and prose_in(node[3])


def norm(node):
    return repr(node)


def apply_errata(key, text, errata):
    """The text with each verified erratum applied: what it says, wherever its words stand however they are spaced, replaced once by what it should say."""
    for e in errata or []:
        if e.get("status") != "Verified":
            raise Bad(f"{key} erratum {e.get('id')} is not verified")
        words = e["says"].split()
        pattern = re.compile(r"\s+".join(re.escape(w) for w in words))
        found = list(pattern.finditer(text))
        if len(found) != e.get("occurs", 1):
            raise Bad(f"{key} erratum {e['id']}: its text occurs {len(found)} times, not {e.get('occurs', 1)}")
        for m in reversed(found):
            indent = len(text[text.rfind("\n", 0, m.start()) + 1:m.start()])
            should = e["should"].split("\n")
            text = text[:m.start()] + ("\n" + " " * (indent + 3)).join(l.strip() for l in should) + text[m.end():]
    return text


CFWS = ["rep", 0, 1, ["ref", "cfws"]]


def structured(node, lexical, defined):
    """RFC 822 section 3.1.4: in a structured field, comments and white space may stand between any two of its elements,
    and before each further one a repetition adds; a lexical rule (a token, a character class) is written whole."""
    kind = node[0]
    if kind == "seq":
        kids = [structured(n, lexical, defined) for n in node[1:]]
        out = ["seq", kids[0]]
        for k in kids[1:]:
            out += [CFWS, k]
        return out
    if kind == "alt":
        return ["alt", *(structured(n, lexical, defined) for n in node[1:])]
    if kind == "rep":
        inner = structured(node[3], lexical, defined)
        return ["rep", node[1], node[2], ["seq", CFWS, inner] if inner[0] == "seq" else inner]
    return node


def notation822(node, defined):
    """RFC 822's own notation within ABNF: <"> is the double quote, and <name> a rule (RFC 2046's 0*69<bchars>)."""
    kind = node[0]
    if kind == "prose":
        if node[1] == '"':
            return ["lit", '"']
        if node[1].lower() in defined:
            return ["ref", node[1].lower()]
        return node
    if kind in ("seq", "alt"):
        return [kind, *(notation822(n, defined) for n in node[1:])]
    if kind == "rep":
        return ["rep", node[1], node[2], notation822(node[3], defined)]
    return node


def rename(node, names):
    if node[0] == "ref":
        return ["ref", names.get(node[1], node[1])]
    if node[0] in ("alt", "seq"):
        return [node[0], *(rename(n, names) for n in node[1:])]
    if node[0] == "rep":
        return ["rep", node[1], node[2], rename(node[3], names)]
    return node


def chars(node, rules, seen=()):
    """The characters a node matches, as sorted disjoint ranges, if it matches one character from a class."""
    kind = node[0]
    if kind == "ref":
        if node[1] in seen or node[1] not in rules:
            raise Bad(f"{node[1]} is not a character class")
        return chars(rules[node[1]], rules, seen + (node[1],))
    if kind == "range":
        return [(node[1], node[2])]
    if kind in ("lit", "cs") and len(node[1]) == 1:
        c = ord(node[1])
        out = [(c, c)]
        if kind == "lit" and node[1].isalpha():
            out.append((ord(node[1].swapcase()), ord(node[1].swapcase())))
        return sorted(out)
    if kind == "alt":
        return merge([r for n in node[1:] for r in chars(n, rules, seen)])
    raise Bad("not a character class")


def merge(ranges):
    out = []
    for lo, hi in sorted(ranges):
        if out and lo <= out[-1][1] + 1:
            out[-1] = (out[-1][0], max(hi, out[-1][1]))
        else:
            out.append((lo, hi))
    return out


def difference(spec, rules):
    """A prose class written as one class with others taken out ("CHAR except SPACE, CTLs, or tspecials"), as ABNF ranges."""
    keep = chars(parse(spec["except"]), rules)
    for minus in spec["minus"]:
        for lo, hi in chars(parse(minus), rules):
            keep = [r for a, b in keep for r in ((a, min(b, lo - 1)), (max(a, hi + 1), b)) if r[0] <= r[1]]
    node = ["alt", *(["range", a, b] for a, b in keep)]
    return ["rep", 1, None, node] if spec.get("many") else node


def grammar(texts, bindings=None):
    """The rules of the given texts, each a dict: key, text, and optionally sections, rules (the only ones it gives),
    lends (it gives only what the others leave undefined), replaces (rules it defines anew over an earlier text's),
    lexical (its rules written whole, in RFC 822 notation: "all" or a list) and errata (verified, applied first).

    Returns {"rules": {name: node}, "from": {name: "key section"}}; bindings
    ({name: [elements, why]}) give a rule a machine-matchable definition where
    its specification states it in prose."""
    rules, origin = {}, {}
    pending = []
    renamed = {}
    for t in texts:
        key = t["key"]
        text = apply_errata(key, unpaginate(t["text"]), t.get("errata"))
        found = definitions(text, t.get("sections"))
        if t.get("rules"):
            missing = set(t["rules"]) - {d[0] for d in found}
            if missing:
                raise Bad(f"{key} does not define {sorted(missing)}")
            found = [d for d in found if d[0] in t["rules"]]
        names = {d[0] for d in found}
        for name, op, elements, section in found:
            try:
                node = parse(elements)
            except Bad as why:
                raise Bad(f"{key} {section} {name}: {why}") from None
            if op == ":=":
                node = notation822(node, names)
                lexical = t.get("lexical", [])
                if lexical != "all" and name not in lexical:
                    node = structured(node, lexical, names)
            pending.append((t, name, op, node, section))
    # A text's own rules first; then the ones lent where nothing else defines them; then what "=/" adds.
    for stage in ("own", "lent", "adds"):
        for t, name, op, node, section in pending:
            key = t["key"]
            if (stage == "adds") != (op == "=/") or (stage != "adds" and bool(t.get("lends")) != (stage == "lent")):
                continue
            if stage == "lent" and name in rules:
                # A lent rule another text names otherwise keeps its own meaning for the text that lends it (RFC 5646's language is not RFC 2231's).
                renamed.setdefault(key, {})[name] = f"{key}:{name}"
                name = f"{key}:{name}"
            if op == "=/":
                if name not in rules:
                    raise Bad(f"{key} {section} {name} adds to a rule not yet defined")
                old = rules[name]
                rules[name] = ["alt", *(old[1:] if old[0] == "alt" else [old]), node]
                origin[name] = f"{origin[name]}, {key} {section}"
                continue
            if name in rules and norm(rules[name]) != norm(node):
                if name in t.get("replaces", []):
                    rules[name] = node
                    origin[name] = f"{key} {section} (anew, over {origin[name]})"
                    continue
                raise Bad(f"{name} is defined twice, differently ({origin[name]} and {key} {section})")
            if name not in rules:
                rules[name] = node
                origin[name] = f"{key} {section}"
    for key, names in renamed.items():
        for name, node in list(rules.items()):
            if origin[name].split(" ")[0] == key:
                rules[name] = rename(node, names)
    for t in texts:
        for name in t.get("replaces", []):
            if "anew" not in origin.get(name, ""):
                raise Bad(f"{t['key']} replaces {name}, which no earlier text defines")
    for name, (elements, why) in (bindings or {}).items():
        if not why:
            raise Bad(f"binding {name} gives no reason")
        if name in rules and not prose_in(rules[name]):
            raise Bad(f"binding {name} replaces a rule its specification already states in ABNF")
        rules[name] = difference(elements, rules) if isinstance(elements, dict) else parse(elements)
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


def encode(rules):
    """The rule table as bytes for Foundation.Abnf's abnfTable (app/src/Foundation/Abnf.lex.tex):
    a 16-bit count of rules, then each rule's node, rules in sorted name order so a rule's
    index is its place there. A node is its tag byte and fields: 0 ref (16-bit rule index),
    1 lit / 2 cs (16-bit count, then each code point in 24 bits), 3 range (24-bit low, high),
    4 alt / 5 seq (16-bit count, then the nodes), 6 rep (16-bit min, 16-bit max, 1 when the
    max bounds it, then the node), 7 prose."""
    names = sorted(rules)
    index = {n: i for i, n in enumerate(names)}
    out = bytearray()
    word = lambda x: out.extend(x.to_bytes(2, "big"))
    triple = lambda x: out.extend(x.to_bytes(3, "big"))

    def node(n):
        kind = n[0]
        if kind == "ref":
            out.append(0); word(index[n[1]])
        elif kind in ("lit", "cs"):
            codes = [ord(c) for c in n[1]]
            out.append(1 if kind == "lit" else 2); word(len(codes))
            for c in codes:
                triple(c)
        elif kind == "range":
            out.append(3); triple(n[1]); triple(n[2])
        elif kind in ("alt", "seq"):
            out.append(4 if kind == "alt" else 5); word(len(n) - 1)
            for kid in n[1:]:
                node(kid)
        elif kind == "rep":
            out.append(6); word(n[1]); word(0 if n[2] is None else n[2]); out.append(0 if n[2] is None else 1); node(n[3])
        elif kind == "prose":
            out.append(7)
        else:
            raise Bad(f"no encoding for node {kind}")

    word(len(names))
    for n in names:
        node(rules[n])
    return names, bytes(out)
