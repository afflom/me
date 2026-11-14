"""Test content from the specifications themselves: app/specs/oracle/spec.json.

Each source is a published specification, fetched at its pinned SHA-256. Its
examples are taken out mechanically:
  - "dashes": an example message between two lines of "----" (RFC 5322
    Appendix A);
  - "vcalendar": every object from BEGIN:VCALENDAR to END:VCALENDAR;
  - "vcard": every object from BEGIN:VCARD to END:VCARD (RFC 6350);
  - "headers": every indented block that opens with a From field and runs to
    the next line of prose (RFC 6047's example messages);
  - "displayed": each row of an "encoded form / displayed as" table, the
    encoded form and what the specification says it displays as (RFC 2047
    section 8), each without the parentheses around it;
  - "vectors": each NAME("input") = "output" test vector (RFC 4648 section 10);
  - "csv": each example after "For example:" in RFC 4180 section 2, its
    written "CRLF" marks made line breaks;
  - "otc": each example of the WICG origin-bound one-time codes report, the
    message and the code the report says it carries, or none.
An example is kept only if every address in it is at a domain reserved for
documentation (the spec's "reserved" list, after RFC 2606 and RFC 6761), so no
real person's address enters the repository; likewise every international
phone number must be in the fictional range PV-01 allows.

Each kept example is then read by a reference reader written to the source's
own grammar, independent of the Prism's code: a message by Python's email
package (policy.default, which implements RFC 5322 and the MIME RFCs), its
plain words included (transfer encoding and charset undone), an
iCalendar object by its content lines (RFC 5545 section 3.1: unfolding,
parameters, TEXT escapes, DATE and DATE-TIME with TZID, UTC or floating), a
vCard by the same content lines (RFC 6350 section 3.3, the formatted name and
first email). What
the reader finds is what test/oracle/read.test.mjs holds the Prism's reading to.
A displayed row and a test vector carry the specification's own answer, which
Python's email.header and base64 must also give, or the extraction is refused.

Writes test/oracle/corpus.json. --check refuses a stale one. --cache DIR reads
and keeps the fetched sources there.

usage: python3 -I tools/oracle/gen.py [--check] [--cache DIR]
"""
import base64
import csv as csvlib
import io
import datetime
import email
import email.header
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


def objects(name):
    """Every object from a line BEGIN:<name> to its END:<name> (RFC 5545 3.4, RFC 6350 6.1.1)."""
    return lambda text: content_objects(text, name)


CONTENT_LINE = re.compile(r"^([A-Za-z0-9-]+\.)?[A-Za-z0-9-]+[;:]")


def content_objects(text, name):
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].strip() == f"BEGIN:{name}":
            j = i
            while j < len(lines) and lines[j].strip() != f"END:{name}":
                j += 1
            block = lines[i : j + 1]
            # Folded lines keep their one leading space after the block's own indent.
            indent = len(block[0]) - len(block[0].lstrip(" "))
            raw = [l[indent:] if l.strip() else "" for l in block if l.strip()]
            # An object is content lines throughout; a BEGIN named in the prose is not one.
            if all(CONTENT_LINE.match(l) or l.startswith((" ", "\t")) for l in raw):
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


def displayed(text):
    """Rows of the table under "encoded form ... displayed as", split at the
    column the table's own heading sets. A row whose encoded form runs on to
    the next line (no closing parenthesis yet) is joined to it by CRLF and
    the continuation's own leading white space, as a folded field is."""
    lines = text.split("\n")
    head = next(i for i, l in enumerate(lines) if re.match(r"^ {3}encoded form\s+displayed as\s*$", l))
    at = lines[head].index("displayed as")
    i = head + 1
    while i < len(lines) and not re.match(r"^\d+\. ", lines[i]):
        line = lines[i]
        encoded, shown = line[:at].rstrip(), line[at:].strip()
        if re.match(r"^ {3}\(=\?", line) and shown.startswith("(") and shown.endswith(")"):
            encoded = encoded.strip()
            while not encoded.endswith(")"):
                i += 1
                encoded += "\r\n" + lines[i].rstrip()
            yield json.dumps({"encoded": encoded[1:-1], "displayed": shown[1:-1]})
        i += 1


VECTOR = re.compile(r'^\s+BASE64\("([^"]*)"\) = "([^"]*)"\s*$')


def vectors(text):
    for line in text.split("\n"):
        m = VECTOR.match(line)
        if m:
            yield json.dumps({"decoded": m.group(1), "encoded": m.group(2)})


def csv_examples(text):
    lines = text.split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("2.  Definition of the CSV Format"))
    end = next(i for i, l in enumerate(lines) if i > start and re.match(r"^3\.  ", l))
    i = start
    while i < end:
        if lines[i].rstrip().endswith("For example:"):
            j = i + 1
            while j < end and not lines[j].strip():
                j += 1
            block = []
            while j < end and lines[j].startswith("       ") and lines[j].strip():
                block.append(lines[j][7:])
                j += 1
            # A written "CRLF" is a line break; a line without one joins the next
            # only inside a quoted field, so a block's lines are joined by CRLF
            # where it is written and stand as written at the end.
            yield "".join(l[: -len(" CRLF")] + "\r\n" if l.endswith(" CRLF") else l for l in block)
            i = j
        else:
            i += 1


def otc_examples(text):
    for block in re.findall(r'<div class="example">(.*?)</div>', text, re.S):
        fenced = re.search(r"```\n\"(.*?)\"\n```", block, re.S)
        inline = re.search(r'(?:The message|code message=\]) `"([^`]*)"`', block)
        message = fenced.group(1) if fenced else inline.group(1) if inline else None
        if message is None:
            continue
        said = None if "is not an" in block else re.search(r'the \[=code=\] is `"([^"]*)"`', block)
        yield json.dumps({"message": message, "code": said.group(1) if said else None})


ADDRESS = re.compile(r"[A-Za-z0-9._%+!$&*=^`{|}~'-]+@([A-Za-z0-9.-]+)")


PHONE = re.compile(r"(?<![A-Za-z0-9])\+([0-9][0-9 .()-]*)(?![A-Za-z0-9])")


def fictional_phones_only(raw):
    """Every international number (8 to 15 digits) is in the fictional range 555-0100 to 555-0199, as PV-01 holds."""
    for m in PHONE.finditer(raw):
        digits = re.sub(r"\D", "", m.group(1))
        if digits[:1] in "123456789" and 8 <= len(digits) <= 15 and not (len(digits) == 11 and digits.startswith("1") and digits[4:9] == "55501"):
            return False
    return True


def documentation_only(raw):
    domains = [d.lower().rstrip(".") for d in ADDRESS.findall(raw)]
    reserved = SPEC["reserved"]
    return all(any(d == r or d.endswith("." + r) for r in reserved) for d in domains) and fictional_phones_only(raw)


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
    # The plain words a person reads (RFC 2045/2046: the first text/plain
    # part not an attachment, its transfer encoding and charset undone).
    plain = msg.get_body(preferencelist=("plain",))
    if plain is not None and not plain.is_attachment():
        words = re.sub(r"\s+", " ", plain.get_content()).strip()
        if words:
            expect["body"] = words
    return expect


def read_displayed(raw):
    row = json.loads(raw)
    python = str(email.header.make_header(email.header.decode_header(row["encoded"])))
    if python != row["displayed"]:
        refuse(f"RFC 2047 says {row['encoded']!r} displays as {row['displayed']!r}; Python's email.header reads {python!r}")
    return {"text": row["displayed"]}


def read_csv(raw):
    return {"rows": [row for row in csvlib.reader(io.StringIO(raw, newline=""), strict=True)]}


OTC_LAST = re.compile(r"^@([^\s@#]+) #([^\s@#]+)(?: @([^\s@#]+))?(?: .*)?$")


def read_otc(raw):
    row = json.loads(raw)
    last = row["message"].split("\n")[-1]
    m = OTC_LAST.match(last)
    parsed = m.group(2) if m else None
    if parsed != row["code"]:
        refuse(f"the report says {row['message']!r} carries {row['code']!r}; its parsing rule finds {parsed!r}")
    return {"code": row["code"]}


def read_vector(raw):
    row = json.loads(raw)
    if base64.b64decode(row["encoded"]).decode("ascii") != row["decoded"]:
        refuse(f"the vector {row} does not decode as written")
    return {"text": row["decoded"]}


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


def read_contact(raw):
    """RFC 6350: FN is the formatted name (6.2.1); EMAIL the address (6.4.2)."""
    expect = {}
    for name, params, value in content_lines(raw):
        name = name.split(".")[-1]
        if name == "FN" and "title" not in expect:
            expect["title"] = text_value(value)
        elif name == "EMAIL" and "who" not in expect:
            expect["who"] = value.removeprefix("mailto:")
    return expect


corpus = []
for source in SPEC["sources"]:
    text = unpaginate(fetch(source))
    take = {"dashes": dashes, "vcalendar": objects("VCALENDAR"), "vcard": objects("VCARD"), "headers": headers, "displayed": displayed, "vectors": vectors, "csv": csv_examples, "otc": otc_examples}[source["examples"]]
    read = {"message": read_message, "calendar": read_calendar, "contact": read_contact, "headerText": read_displayed, "base64": read_vector, "csv": read_csv, "oneTimeCode": read_otc}[source["kind"]]
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
