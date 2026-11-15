"""Writes the grammars the Prism reads by (app/specs/grammar/spec.json).

    python3 -I tools/standards/grammar.py [--check] [--cache DIR]

Each grammar is its specifications' own ABNF, taken from their text at its
pinned SHA-256 (tools/standards/abnf.py), and written as data to its out
module for site/read/abnf.mjs: the rules, where each is defined, the header
fields it defines and, for mail, RFC 5322 section 4.3's zone names. --check
refuses unless every out module is current.
"""
import email
import email.policy
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import abnf  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/grammar/spec.json").read_text(encoding="utf-8"))
args = sys.argv[1:]
cache = pathlib.Path(args[args.index("--cache") + 1]) if "--cache" in args else None


def refuse(why):
    sys.exit(f"grammar: {why}")


def fetch(text):
    path = cache / f"{text['key']}.txt" if cache else None
    if path and path.exists():
        data = path.read_bytes()
    else:
        with urllib.request.urlopen(text["url"], timeout=60) as response:
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != text["sha256"]:
        refuse(f"{text['key']} at {text['url']} is {digest}, not the pinned {text['sha256']}")
    return data.decode("utf-8")


def opening(node):
    """The literal a rule opens with, if it opens with one."""
    while node[0] == "seq":
        node = node[1]
    return node[1] if node[0] == "lit" else None


def fields_of(rules):
    """Each header field the grammar defines, by name: the rules that open with its name, current before obsolete.
    RFC 5322's rules end with the field's CRLF; RFC 2045's (in RFC 822 notation) leave it to the header they stand in."""
    out = {}
    for name, node in rules.items():
        lit = opening(node)
        if not lit or not re.fullmatch(r"[A-Za-z][A-Za-z0-9-]*:?", lit):
            continue
        # A field's rule opens with its whole name (not a prefix such as RFC 2045's "Content-"), then its colon.
        if node[0] != "seq" or lit.endswith("-"):
            continue
        if not lit.endswith(":") and not any(n[0] == "lit" and n[1] == ":" for n in node[1:]):
            continue
        out.setdefault(lit.rstrip(":").lower(), []).append(name)
    for names in out.values():
        names.sort(key=lambda n: n.startswith("obs-"))
    return dict(sorted(out.items()))


def zones_of(text):
    """RFC 5322 section 4.3's zone names, from its own sentences, in minutes east of UTC."""
    plain = " ".join(abnf.unpaginate(text).split())
    out = {}
    for name, sign, hh, mm in re.findall(r"\b([A-Z]{2,4}) is semantically equivalent to ([+-])(\d\d)(\d\d)", plain):
        out[name] = (1 if sign == "+" else -1) * (int(hh) * 60 + int(mm))
    m = re.search(r'"(\w+)" and "(\w+)" are indications of .*? semantically identical to "\+0000"', plain)
    if not m or len(out) != 8:
        refuse("RFC 5322 section 4.3's zones are not where its text gives them")
    out[m.group(1)] = out[m.group(2)] = 0
    return dict(sorted(out.items()))


outputs = {}
for g in SPEC["grammars"]:
    texts = {t["key"]: fetch(t) for t in g["texts"]}
    try:
        table = abnf.grammar([{**t, "text": texts[t["key"]]} for t in g["texts"]], g.get("bindings"))
    except abnf.Bad as why:
        refuse(f"{g['key']}: {why}")
    # A text that lends its rules ("lends": RFC 5234's core rules) gives only those the others reach.
    lent = {t["key"] for t in g["texts"] if t.get("lends")}
    if lent:
        own = {n for n, o in table["from"].items() if o.split(" ")[0] not in lent}
        reach, todo = set(own), list(own)
        while todo:
            for r in abnf.refs(table["rules"][todo.pop()]):
                if r not in reach:
                    reach.add(r)
                    todo.append(r)
        table = {k: {n: v for n, v in table[k].items() if n in reach} for k in table}
    data = {"key": g["key"], "texts": [{k: t[k] for k in ("key", "url", "sha256")} for t in g["texts"]], **table}
    if g.get("headers"):
        data["fields"] = fields_of(table["rules"])
    if g.get("zones"):
        data["zones"] = zones_of(texts[g["zones"]])
    # Each rule's witness: the shortest field (or message) its grammar derives through it, and where it lies there.
    if g.get("witnesses"):
        short = abnf.shortest(table["rules"])
        contexts = sorted({r for rs in data.get("fields", {}).values() for r in rs} | {"optional-field", "message"})
        found = {}
        for rule in sorted(table["rules"]):
            each = abnf.witnesses(table["rules"], rule, short)
            best = min(((each[c], c) for c in contexts if c in each), key=lambda w: (len(w[0][0]), w[1]), default=None)
            if best is None and rule in short:
                # A rule no field refers to (RFC 5322's specials) is its own witness.
                best = ((short[rule], 0, len(short[rule])), rule)
            if best is None:
                refuse(f"{g['key']}: no text derives {rule}")
            (text, start, end), context = best
            found[rule] = {"context": context, "text": text, "start": start, "end": end}
        outputs[ROOT / g["witnesses"]] = json.dumps({"comment": f"Generated by tools/standards/grammar.py: for each rule of the {g['key']} grammar, the shortest field or message its grammar derives through it (context), and where the rule's own text lies in it (start, end, in characters). Do not edit.", "witnesses": found}, indent=1, ensure_ascii=False) + "\n"
    # The texts' own example fields, read by an independent reference reader.
    if g.get("examples"):
        ex = g["examples"]
        found = []
        pinned = {t["key"]: t for t in g["texts"]}
        for key in ex["texts"]:
            text = abnf.apply_errata(key, abnf.unpaginate(texts[key]), pinned[key].get("errata"))
            lines = text.split("\n")
            for i, line in enumerate(lines):
                m = re.match(r"^(\s+)(" + "|".join(map(re.escape, ex["names"])) + r"):", line)
                if not m:
                    continue
                indent = len(m.group(1))
                block = [line[indent:]]
                for nxt in lines[i + 1:]:
                    if nxt.strip() and len(nxt) - len(nxt.lstrip()) > indent and not re.match(r"^\s+[A-Za-z-]+:", nxt):
                        block.append(" " + nxt.strip())
                    else:
                        break
                field = "\r\n".join(block) + "\r\n"
                header = email.message_from_string(field + "\r\n", policy=email.policy.default)[m.group(2)]
                expect = {"defective": bool(header.defects)}
                if not header.defects:
                    if m.group(2).lower() == "content-type":
                        expect["type"] = header.content_type
                    else:
                        expect["type"] = header.content_disposition
                    expect["params"] = {k.lower(): v for k, v in header.params.items()}
                found.append({"id": f"{key}-{len(found) + 1}", "from": key, "text": field, "expect": expect})
        outputs[ROOT / ex["out"]] = json.dumps({"comment": "Generated by tools/standards/grammar.py: each example field of the pinned texts, with what Python's email package reads of it. Do not edit.", "examples": found}, indent=1, ensure_ascii=False) + "\n"
    outputs[ROOT / g["out"]] = (
        f"// Generated by tools/standards/grammar.py from app/specs/grammar/spec.json ({g['title']}). Do not edit.\n"
        f"export default {json.dumps(data, separators=(',', ':'), ensure_ascii=False)};\n"
    )

if "--check" in args:
    stale = [str(p.relative_to(ROOT)) for p, want in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != want]
    if stale:
        refuse(f"stale, run python3 -I tools/standards/grammar.py: {', '.join(stale)}")
    print(f"grammar: {len(outputs)} grammars current")
else:
    for p, want in outputs.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(want, encoding="utf-8")
    print(f"grammar: wrote {', '.join(str(p.relative_to(ROOT)) for p in outputs)}")
