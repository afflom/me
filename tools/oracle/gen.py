"""Test content from the specifications themselves: app/specs/oracle/spec.json.

Each source is a published specification, fetched at its pinned SHA-256. Its
examples are taken out mechanically:
  - "dashes": an example message between two lines of "----" (RFC 5322
    Appendix A);
  - "vcalendar": every object from BEGIN:VCALENDAR to END:VCALENDAR;
  - "headers": every indented block that opens with a From field and runs to
    the next line of prose (RFC 6047's example messages).
A source's "label" is the kind of thing its specification says its examples
are; the reference reader adds the people each example is with.
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


def headers(text):
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if re.match(r"^ {3,}From: ", lines[i]):
            j = i
            while j < len(lines) and (not lines[j].strip() or lines[j].startswith("   ")):
                j += 1
            block = lines[i:j]
            while block and not block[-1].strip():
                block.pop()
            yield "\r\n".join(dedent(block)) + "\r\n"
            i = j
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
    parties = []
    for field in ("from", "to", "cc"):
        try:
            for a in (msg[field].addresses if msg[field] is not None else ()):
                one = a.display_name or a.addr_spec
                if one and one not in parties:
                    parties.append(one)
        except (AttributeError, TypeError):
            pass
    # A message that carries an iCalendar object (iMIP, RFC 6047) is with the people the object names.
    for part in msg.walk():
        if part.get_content_type() == "text/calendar":
            invited = read_calendar(part.get_content().replace("\r\n", "\n").replace("\n", "\r\n")).get("parties", [])
            if invited:
                parties = invited
                expect["carries"] = "text/calendar"
    expect["parties"] = parties
    # What its sender says first: the first sentence of the plain text body's
    # first line that is not quoted (RFC 3676 4.5: a quote starts with ">").
    body = msg.get_body(preferencelist=("plain",))
    if body is not None:
        for line in body.get_content().splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if not line or line.startswith(">"):
                continue
            m = re.match(r"^(.+?[.!?])(\s|$)", line)
            expect["lead"] = m.group(1) if m else line
            break
    if msg["date"] is not None:
        try:
            when = msg["date"].datetime
            if when is not None:
                expect["at"] = ms(when)
        except (AttributeError, ValueError, TypeError):
            pass
    # Where it stands in its conversation (RFC 5322 3.6.4): its own identifier,
    # the one it replies to, and every one it references, oldest first. The
    # order of a conversation is this dependence, not the clock.
    ids = lambda field: re.findall(r"<[^<>\s]+>", str(msg[field] or ""))
    if ids("message-id"):
        expect["id"] = ids("message-id")[0]
    if ids("in-reply-to"):
        expect["replyTo"] = ids("in-reply-to")
    if ids("references"):
        expect["refs"] = ids("references")
    return expect


def content_lines(raw):
    """RFC 5545 3.1: unfold, then name *(";" param) ":" value."""
    unfolded = re.sub(r"\r\n[ \t]", "", raw)
    for line in unfolded.split("\r\n"):
        if not line:
            continue
        # A parameter value may be a quoted string holding ":" or ";" (3.1, param-value).
        m = re.match(r'^([^;:]+)((?:;(?:[^:";]|"[^"]*")*)*):(.*)$', line)
        if not m:
            continue
        params = {}
        for p in re.findall(r';((?:[^;"]|"[^"]*")*)', m.group(2)):
            k, _, v = p.partition("=")
            params[k.upper()] = v.strip('"')
        yield m.group(1).upper(), params, m.group(3)


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
    expect, depth, inside, people = {}, [], False, {}
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
        # Who it is with (3.8.4.1 ATTENDEE, 3.8.4.3 ORGANIZER), in any scheduling
        # component: one person per address, by CN when given; a room or a
        # resource (3.2.3 CUTYPE) is not a person.
        if name in ("ORGANIZER", "ATTENDEE") and depth and depth[-1] in ("VEVENT", "VTODO", "VJOURNAL", "VFREEBUSY"):
            if params.get("CUTYPE", "").upper() not in ("ROOM", "RESOURCE"):
                address = re.sub(r"(?i)^mailto:", "", value).strip()
                people.setdefault(address.lower(), [address, None])
                if params.get("CN") and not people[address.lower()][1]:
                    people[address.lower()][1] = params["CN"]
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
        # Its own count of revisions (RFC 5545 3.8.1.4 UID, 3.8.7.4 SEQUENCE):
        # a later revision of the same UID has the higher SEQUENCE.
        elif name == "UID" and "uid" not in expect:
            expect["uid"] = value
        elif name == "SEQUENCE" and "sequence" not in expect and value.strip().isdigit():
            expect["sequence"] = int(value)

    if people:
        expect["parties"] = [cn or address for address, cn in people.values()]
    return expect


# Every label is a kind the Prism's kind reader names; a kind with no source
# says why, and leaves the list once a source gives it examples.
KINDS = {k["key"] for k in json.loads((ROOT / "app/specs/router/spec.json").read_text(encoding="utf-8"))["providers"]["kind"]["kinds"]}
sourced = {s["label"] for s in SPEC["sources"] if "label" in s}
for s in SPEC["sources"]:
    if s.get("label") not in KINDS:
        refuse(f"{s['key']} labels its examples {s.get('label')!r}, which is not a kind the kind reader names")
for u in SPEC.get("unsourced", []):
    if u.get("label") not in KINDS or not str(u.get("why", "")).strip():
        refuse(f"unsourced {u.get('label')!r} is not a kind with a reason")
    if u["label"] in sourced:
        refuse(f"unsourced {u['label']!r} has a source now: remove it from unsourced")

corpus = []
for source in SPEC["sources"]:
    text = unpaginate(fetch(source))
    take = {"dashes": dashes, "vcalendar": vcalendar, "headers": headers}[source["examples"]]
    read = {"message": read_message, "calendar": read_calendar}[source["kind"]]
    n = kept = 0
    for raw in take(text):
        n += 1
        if not documentation_only(raw):
            continue
        kept += 1
        expect = read(raw)
        # What a person calls it is what its specification says it is.
        if "label" in source:
            expect["label"] = source["label"]
        corpus.append({"id": f"{source['key']}-{n}", "source": source["key"], "kind": source["kind"], "raw": raw, "expect": expect})
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
