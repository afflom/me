"""Test content from the specifications themselves: app/specs/oracle/spec.json.

Each source is a published specification, fetched at its pinned SHA-256. Its
examples are taken out mechanically:
  - "dashes": an example message between two lines of "----" (RFC 5322
    Appendix A);
  - "vcalendar": every object from BEGIN:VCALENDAR to END:VCALENDAR.
An example is kept only if every address in it is at a domain reserved for
documentation (the spec's "reserved" list, after RFC 2606 and RFC 6761), so no
real person's address enters the repository.

Each kept example is then read by a reference reader written to the source's
own grammar, independent of the Prism's code: a message by Python's email
package (policy.default, which implements RFC 5322 and the MIME RFCs), an
iCalendar object by its content lines (RFC 5545 section 3.1: unfolding,
parameters, TEXT escapes, DATE and DATE-TIME with TZID, UTC or floating). What
the reader finds is what test/oracle/read.test.mjs holds the Prism's reading to.

Writes test/oracle/corpus.json. --check refuses a stale one. --cache DIR reads
and keeps the fetched sources there.

usage: python3 -I tools/oracle/gen.py [--check] [--cache DIR]
"""
import datetime
import email
import email.policy
import email.utils
import hashlib
import json
import pathlib
import re
import sys
import urllib.request
import zoneinfo

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
OUT = ROOT / "test/oracle/corpus.json"
args = sys.argv[1:]
cache = pathlib.Path(args[args.index("--cache") + 1]) if "--cache" in args else None


def refuse(why):
    sys.exit(f"oracle: {why}")


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
            # A break between two lines of one indented example joins them; elsewhere it is a paragraph break.
            if not (out and i < len(lines) and out[-1].startswith("   ") and lines[i].startswith("   ")):
                out.append("")
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def dedent(block):
    indent = min(len(l) - len(l.lstrip(" ")) for l in block if l.strip())
    return [l[indent:] if l.strip() else "" for l in block]


def dashes(text):
    lines = text.split("\n")
    marks = [i for i, l in enumerate(lines) if l.strip() == "----"]
    for a, b in zip(marks[0::2], marks[1::2]):
        yield "\r\n".join(dedent(lines[a + 1 : b])) + "\r\n"


def vcalendar(text):
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].strip() == "BEGIN:VCALENDAR":
            j = i
            while j < len(lines) and lines[j].strip() != "END:VCALENDAR":
                j += 1
            block = lines[i : j + 1]
            # Folded lines keep their one leading space after the block's own indent.
            indent = len(block[0]) - len(block[0].lstrip(" "))
            raw = [l[indent:] if l.strip() else "" for l in block if l.strip()]
            yield "\r\n".join(raw) + "\r\n"
            i = j + 1
        else:
            i += 1


ADDRESS = re.compile(r"[A-Za-z0-9._%+!$&*=^`{|}~'-]+@([A-Za-z0-9.-]+)")


def documentation_only(raw):
    domains = [d.lower().rstrip(".") for d in ADDRESS.findall(raw)]
    reserved = SPEC["reserved"]
    return all(any(d == r or d.endswith("." + r) for r in reserved) for d in domains)


def ms(dt):
    return int(dt.timestamp() * 1000)


def read_message(raw):
    msg = email.message_from_string(raw, policy=email.policy.default)
    expect = {}
    if msg["subject"] is not None:
        expect["title"] = re.sub(r"\s+", " ", str(msg["subject"])).strip()
    sender = msg["from"] or msg["to"]
    if sender is not None:
        try:
            first = sender.addresses[0]
            expect["who"] = first.display_name or first.addr_spec
        except (IndexError, AttributeError, TypeError):
            pass
    if msg["date"] is not None:
        try:
            when = msg["date"].datetime
            if when is not None:
                expect["at"] = ms(when)
        except (AttributeError, ValueError, TypeError):
            pass
    return expect


def content_lines(raw):
    """RFC 5545 3.1: unfold, then name *(";" param) ":" value."""
    unfolded = re.sub(r"\r\n[ \t]", "", raw)
    for line in unfolded.split("\r\n"):
        if not line:
            continue
        name_params, _, value = line.partition(":")
        parts = name_params.split(";")
        params = {}
        for p in parts[1:]:
            k, _, v = p.partition("=")
            params[k.upper()] = v.strip('"')
        yield parts[0].upper(), params, value


def text_value(value):
    """RFC 5545 3.3.11 TEXT: \\\\ \\; \\, \\n."""
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value)


def date_time(params, value):
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return {"date": f"{value[0:4]}-{value[4:6]}-{value[6:8]}"}
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)", value)
    if not m:
        return None
    y, mo, d, h, mi, s, z = m.groups()
    local = datetime.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s))
    if z:
        return {"at": ms(local.replace(tzinfo=datetime.timezone.utc))}
    if "TZID" in params:
        try:
            return {"at": ms(local.replace(tzinfo=zoneinfo.ZoneInfo(params["TZID"].lstrip("/"))))}
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            return {"zone": params["TZID"], "local": local.isoformat()}
    return {"local": local.isoformat()}


def read_calendar(raw):
    expect, depth, inside = {}, [], False
    for name, params, value in content_lines(raw):
        if name == "BEGIN":
            depth.append(value.upper())
            if value.upper() in ("VEVENT", "VTODO", "VJOURNAL") and "component" not in expect:
                inside = True
                expect["component"] = value.upper()
            continue
        if name == "END":
            if depth and depth[-1] in ("VEVENT", "VTODO", "VJOURNAL"):
                inside = False
            if depth:
                depth.pop()
            continue
        if not inside or depth[-1] not in ("VEVENT", "VTODO", "VJOURNAL"):
            continue
        if name == "SUMMARY" and "title" not in expect:
            expect["title"] = text_value(value).replace("\n", " ")
        elif name == "LOCATION" and "who" not in expect:
            expect["who"] = text_value(value).replace("\n", " ")
        elif name == "DTSTART" and "start" not in expect:
            start = date_time(params, value)
            if start:
                expect["start"] = start
        elif name == "RRULE":
            expect["repeats"] = True
    return expect


corpus = []
for source in SPEC["sources"]:
    text = unpaginate(fetch(source))
    take = {"dashes": dashes, "vcalendar": vcalendar}[source["examples"]]
    read = {"message": read_message, "calendar": read_calendar}[source["kind"]]
    n = kept = 0
    for raw in take(text):
        n += 1
        if not documentation_only(raw):
            continue
        kept += 1
        corpus.append({"id": f"{source['key']}-{n}", "source": source["key"], "kind": source["kind"], "raw": raw, "expect": read(raw)})
    if not kept:
        refuse(f"{source['key']} gave no example at a documentation domain")

ids = {c["id"] for c in corpus}
for d in SPEC.get("debt", []):
    if d["id"] not in ids:
        refuse(f"debt names {d['id']}, which is not an example of any source")

text = json.dumps({"comment": "Generated by tools/oracle/gen.py from app/specs/oracle/spec.json. Do not edit.", "corpus": corpus}, indent=1, ensure_ascii=False) + "\n"
if "--check" in args:
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        refuse("test/oracle/corpus.json is stale: run python3 -I tools/oracle/gen.py")
    sys.exit(0)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
print(f"oracle: {len(corpus)} examples from {len(SPEC['sources'])} specifications")
