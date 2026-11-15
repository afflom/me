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
    message and the code the report says it carries, or none;
  - "recurrences": each example of RFC 5545 section 3.8.5.3, its DTSTART,
    EXDATE and RRULE lines (one example per RRULE where it gives two, "or")
    and the instances the specification lists for it after "==>";
  - "page": the whole test page, its cases graded in a browser (the Web
    Platform Tests' accname pages: each case names its expected name);
  - "markup": each example of a schema.org release (its examples file) whose
    JSON-LD names, at its top, a type the source labels, carried as the HTML
    body of a MIME entity (RFC 2045: a Content-Type and nothing else), the way
    mail that books or sells embeds it (JSON-LD 1.1 section 7);
  - "patterns": each distinct pattern string of a labelled research dataset
    whose category the source names (Mathur et al., "Dark Patterns at Scale",
    CSCW 2019: the urgency and scarcity lines found on shopping sites);
  - "pairs": each sentence pair of a graded semantic-similarity benchmark in
    the genre the source names (the STS Benchmark's image and video captions,
    Cer et al., SemEval-2017 Task 1), with the similarity its annotators gave it
    on the benchmark's 0 to 5 scale.
A source's "label" is the kind of thing its specification says its whole
messages and events are, or its "labels" the kind each schema.org type it
carries is; the reference reader adds the people each example is with.
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
A recurrence example carries the specification's own instances: its listing
is read as written, a year (or a day) in parentheses with its zone's
abbreviation, then months and days (or times); "..." ends what is listed, and
a listing with no "..." of a rule with COUNT or UNTIL is the whole set. Each
listed instance must carry the abbreviation its zone gives it, or the
extraction is refused.
A source's verified errata (RFC Editor) are applied to its text first, each
replacing the text it says the RFC says, which must occur once.
A displayed row and a test vector carry the specification's own answer, which
Python's email.header and base64 must also give, or the extraction is refused.

Writes test/oracle/corpus.json, and model/authorities.toml with one cited
authority per pinned source, realized by OR-01, so the oracle spec stays the one
place a source is named.

It also writes the vocabulary register from app/specs/vocab/spec.json:
site/vocab/register.json and its Lean modules (Foundation.Vocab.V1.SchemaOrg,
.Crosswalk, Foundation.Me.V1.Anchors), schema.org's release read in full and
every term of eleven other schemas read from their own registries and
ontologies, each pinned and cited (RT-01). Before it writes, the register is
held to schema.org's own files: the release's whole graph and attic, the
JSON-LD context, and every example of the release (the "schemaorg" source). --check refuses either if stale. --cache DIR reads
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
import gzip
import hashlib
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import zoneinfo

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
OUT = ROOT / "test/oracle/corpus.json"
AUTHORITIES = ROOT / "model/authorities.toml"
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
    # A benchmark published compressed (gzip, RFC 1952) is pinned as published and read uncompressed.
    if source["url"].endswith(".gz"):
        data = gzip.decompress(data)
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


def pattern_examples(text, source):
    seen = set()
    for row in csvlib.DictReader(io.StringIO(text, newline="")):
        if row["Pattern Category"] not in source["categories"]:
            continue
        words = row["Pattern String"].strip()
        key = re.sub(r"\d+", "#", words.lower())
        # A line with no words (a bare timer) or one already taken in another number is not a new example.
        if not re.search(r"[A-Za-z]{3}", words) or key in seen:
            continue
        seen.add(key)
        yield json.dumps({"text": words, "category": row["Pattern Category"], "type": row["Pattern Type"]})


def markup_examples(text, source):
    """Each schema.org example's JSON-LD whose top object is of a labelled type."""
    for block in re.split(r"\n(?=TYPES: #eg-)", text):
        m = re.search(r"\nJSON:\s*\n(.*?)(?=\n[A-Z-]+:\s*\n|\Z)", block, re.S)
        if not m:
            continue
        for script in re.findall(r'<script type="application/ld\+json">.*?</script>', m.group(1), re.S):
            try:
                top = json.loads(re.sub(r"^<script[^>]*>|</script>$", "", script))
            except ValueError:
                continue
            types = [str(t) for t in ([top.get("@type")] if isinstance(top, dict) and not isinstance(top.get("@type"), list) else (top.get("@type") if isinstance(top, dict) else []))]
            if any(t in source["labels"] for t in types):
                yield "MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" + script.replace("\r\n", "\n").replace("\n", "\r\n") + "\r\n"


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
    # The schema.org objects its HTML carries as JSON-LD (JSON-LD 1.1 section
    # 7): their types, and the people they name (a Person as underName,
    # customer, attendee or broker) as who it is with.
    types, named = [], []

    def visit(node):
        if isinstance(node, list):
            for n in node:
                visit(n)
        elif isinstance(node, dict):
            if isinstance(node.get("@graph"), list):
                visit(node["@graph"])
                return
            t = node.get("@type")
            for one in (t if isinstance(t, list) else [t] if t else []):
                types.append(re.sub(r"^(https?://schema\.org/|schema:)", "", str(one)))
            for key in ("underName", "customer", "attendee", "broker"):
                v = node.get(key)
                for p in (v if isinstance(v, list) else [v]):
                    if isinstance(p, dict) and "Person" in ([p.get("@type")] if not isinstance(p.get("@type"), list) else p.get("@type")) and p.get("name"):
                        if p["name"].strip() not in named:
                            named.append(p["name"].strip())

    for part in msg.walk():
        if part.get_content_type() == "text/html":
            for js in re.findall(r"<script\b[^>]*type=[\"']?application/ld\+json[\"']?[^>]*>(.*?)</script>", part.get_content(), re.S | re.I):
                try:
                    visit(json.loads(js))
                except ValueError:
                    pass
    if types:
        expect["types"] = types
        parties += [n for n in named if n not in parties]
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
    # The plain words a person reads (RFC 2045/2046: the first text/plain
    # part not an attachment, its transfer encoding and charset undone).
    plain = msg.get_body(preferencelist=("plain",))
    if plain is not None and not plain.is_attachment():
        words = re.sub(r"\s+", " ", plain.get_content()).strip()
        if words:
            expect["body"] = words
    # Where it stands in its conversation (RFC 5322 3.6.4): its own identifier,
    # the one it replies to, and every one it references, oldest first. The
    # order of a conversation is this dependence, not the clock.
    ids = lambda field: re.findall(r"<[^<>\s]+>", str(msg[field] or ""))
    if ids("message-id"):
        expect["id"] = ids("message-id")[0]
    # Its sender's address (RFC 5322 3.6.2 From), by which another source can name them.
    if msg["from"] is not None:
        try:
            expect["from"] = msg["from"].addresses[0].addr_spec.lower()
        except (IndexError, AttributeError, TypeError):
            pass
    if ids("in-reply-to"):
        expect["replyTo"] = ids("in-reply-to")
    if ids("references"):
        expect["refs"] = ids("references")
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


def read_pattern(raw):
    row = json.loads(raw)
    return {"coercive": True, "type": row["type"]}


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
        expect["addresses"] = [address.lower() for address, cn in people.values()]
    return expect


def recurrences(text):
    """RFC 5545 3.8.5.3's examples: a description, its iCalendar lines, and the instances listed after "==>"."""
    lines = text.split("\n")
    heads = [i for i, l in enumerate(lines) if l.startswith("3.8.5.3.  Recurrence Rule")]
    ends = [i for i, l in enumerate(lines) if l.startswith("3.8.6.  Alarm Component Properties")]
    if not heads or not ends:
        refuse("rfc5545 has no section 3.8.5.3")
    body = lines[heads[-1] : ends[-1]]
    start = next(i for i, l in enumerate(body) if l.strip().startswith("Example:  All examples assume"))
    i, said = start + 1, []
    while i < len(body):
        line = body[i]
        if not line.strip().startswith("DTSTART"):
            # The description: the paragraph before the example, which ends in ":".
            if line.strip() and not line.strip().startswith("Note:") and len(line) - len(line.lstrip()) == 6:
                said = [line.strip()] if not said or said[-1].endswith(":") else said + [line.strip()]
            i += 1
            continue
        # The iCalendar lines, to the listing; a line that opens with a space continues the one before (3.1).
        props, rules = [], []
        while i < len(body) and not body[i].strip().startswith("==>"):
            raw = body[i]
            if raw.strip() and raw.strip() != "or":
                if raw.startswith("        ") and not raw.strip().startswith(("DTSTART", "RRULE", "EXDATE", "RDATE")):
                    if props[-1] == "RRULE":
                        rules[-1] += raw.strip()
                    else:
                        props[-1] += raw.strip()
                elif raw.strip().startswith("RRULE"):
                    rules.append(raw.strip())
                    props.append("RRULE")
                else:
                    props.append(raw.strip())
            i += 1
        listing = []
        # The listing runs to a blank line or the next description (a page break can join them).
        while i < len(body) and body[i].strip() and len(body[i]) - len(body[i].lstrip()) > 6:
            listing.append(body[i].strip())
            i += 1
        others = [p for p in props if p != "RRULE"]
        title = " ".join(said).rstrip(":")
        for rule in rules:
            yield json.dumps({"title": title, "ical": "\r\n".join(others + [rule]) + "\r\n", "listed": " ".join(listing)}, ensure_ascii=False)
        said = []


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def read_recurrence(raw):
    row = json.loads(raw)
    props = {name: (params, value) for name, params, value in content_lines(row["ical"])}
    params, value = props["DTSTART"]
    zone = zoneinfo.ZoneInfo(params["TZID"])
    first = datetime.datetime.strptime(value, "%Y%m%dT%H%M%S")
    listed = row["listed"].removeprefix("==>").replace("...", " \u2016 ")
    out, cut = [], "\u2016" in listed
    for head, rest in re.findall(r"\(([^)]*)\)\s*([^(]*)", listed):
        h = head.split()
        abbr = h[-1]
        day = re.fullmatch(r"([A-Z][a-z]+) (\d+), (\d{4}) [A-Z]+", head)
        if day:
            # A day, then its times.
            month, d, y = MONTHS.index(day.group(1)) + 1, int(day.group(2)), int(day.group(3))
            when = [(y, month, d, int(hh), int(mm)) for hh, mm in re.findall(r"(\d{1,2}):(\d{2})", rest.split("\u2016")[0])]
        else:
            # A year (and a time of day), then months and their days.
            y = int(h[0])
            t = re.search(r"(\d{1,2}):(\d{2}) (AM|PM)", head)
            hh, mm = ((int(t.group(1)) % 12 + (12 if t.group(3) == "PM" else 0)), int(t.group(2))) if t else (first.hour, first.minute)
            when, month = [], None
            for token in re.findall(r"[A-Z][a-z]+|\d+-\d+|\d+", rest.split("\u2016")[0]):
                if token in MONTHS:
                    month = MONTHS.index(token) + 1
                elif "-" in token:
                    a, b = map(int, token.split("-"))
                    when += [(y, month, d, hh, mm) for d in range(a, b + 1)]
                else:
                    when.append((y, month, int(token), hh, mm))
        for y, mo, d, hh, mm in when:
            local = datetime.datetime(y, mo, d, hh, mm, tzinfo=zone)
            if local.tzname() != abbr:
                refuse(f"rfc5545 3.8.5.3 lists {local.isoformat()} as {abbr}, which {params['TZID']} calls {local.tzname()}")
            out.append(ms(local))
        if "\u2016" in rest:
            break
    rule = props["RRULE"][1]
    whole = not cut and bool(re.search(r"(^|;)(COUNT|UNTIL)=", rule))
    expect = {"title": row["title"], "start": {"at": ms(first.replace(tzinfo=zone))}, "rule": rule, "instances": out, "whole": whole}
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

# Every label is a kind the Prism's kind reader names; a kind with no source
# says why, and leaves the list once a source gives it examples.
KINDS = {k["key"] for k in json.loads((ROOT / "app/specs/router/spec.json").read_text(encoding="utf-8"))["providers"]["kind"]["kinds"]}
sourced = {s["label"] for s in SPEC["sources"] if "label" in s} | {k for s in SPEC["sources"] for k in s.get("labels", {}).values()}
for s in SPEC["sources"]:
    if s["kind"] in ("message", "calendar") and not s.get("labels") and s.get("label") not in KINDS:
        refuse(f"{s['key']} labels its examples {s.get('label')!r}, which is not a kind the kind reader names")
    for t, k in s.get("labels", {}).items():
        if k not in KINDS:
            refuse(f"{s['key']} labels its {t} examples {k!r}, which is not a kind the kind reader names")
for u in SPEC.get("unsourced", []):
    if u.get("label") not in KINDS or not str(u.get("why", "")).strip():
        refuse(f"unsourced {u.get('label')!r} is not a kind with a reason")
    if u["label"] in sourced:
        refuse(f"unsourced {u['label']!r} has a source now: remove it from unsourced")

def page(text):
    """A test page taken whole: its cases need the page around them (WPT accname)."""
    return [text]


def read_accname(raw):
    """W3C AccName, as the Web Platform Tests grade it: each element of class
    "ex" names its expected accessible name (data-expectedlabel) and its case
    (data-testname); the browser test compares the Prism's computed name."""
    from html.parser import HTMLParser

    names = []

    class Cases(HTMLParser):
        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            if "ex" in (a.get("class") or "").split() and "data-expectedlabel" in a:
                names.append({"test": a.get("data-testname", ""), "name": re.sub(r"\s+", " ", a["data-expectedlabel"]).strip()})

    Cases().feed(raw)
    return {"names": names}


def read_feed(raw):
    """WAI-ARIA Authoring Practices' feed example: its own renderer and data.
    Each restaurant it renders is an article labelled by its name
    (aria-labelledby), so a reader of the feed hears each name, in order."""
    data = raw[raw.index("aria.RestaurantData"):raw.index("];", raw.index("aria.RestaurantData"))]
    names = [json.loads(m.group(1)) if m.group(1) else m.group(2).replace("\\'", "'") for m in re.finditer(r"\bname:\s*(?:(\"(?:[^\"\\\\]|\\\\.)*\")|'((?:[^'\\\\]|\\\\.)*)')", data)]
    return {"names": names}

# ---------------------------------------------------------------------------
# The vocabulary register (app/specs/vocab/spec.json, RT-01).
#
# schema.org's published release file, read in full, and every term of the
# other schemas' own registries and ontologies, each fetched at its pin. The
# readers below take each file by its own format: the release's JSON-LD graph,
# an IANA registry's CSV or XML, Turtle (W3C REC, 2014) and RDF/XML (W3C REC,
# 2014), with the standard library only. What they write is the register the
# page reads and the Lean modules the proofs read, in the same order.

VOCAB = json.loads((ROOT / "app/specs/vocab/spec.json").read_text(encoding="utf-8"))
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
OWL = "http://www.w3.org/2002/07/owl#"
RDFS = "http://www.w3.org/2000/01/rdf-schema#"
CLASS_TYPES = {OWL + "Class", RDFS + "Class"}
PROPERTY_TYPES = {RDF_NS + "Property", OWL + "ObjectProperty", OWL + "DatatypeProperty", OWL + "AnnotationProperty", OWL + "FunctionalProperty"}


def fetch_pin(pin):
    path = cache / "vocab" / pin["file"] if cache else None
    if path and path.exists():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(pin["url"], headers={"Accept": "text/turtle, application/rdf+xml;q=0.9, */*;q=0.5", "User-Agent": "prism-oracle/1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin["sha256"]:
        refuse(f"{pin['file']} at {pin['url']} is {digest}, not the pinned {pin['sha256']}")
    return data


def resolve(base, ref):
    """RFC 3986 section 5.2 reference resolution (urllib.parse.urljoin) of a relative reference."""
    return ref if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", ref) else urllib.parse.urljoin(base, ref)


TTL_TOKEN = re.compile(r'''
    (?P<ws>\s+|\#[^\n]*)
  | (?P<iri><[^>]*>)
  | (?P<long>"""(?:[^"\\]|\\.|"(?!""))*"""|\'\'\'(?:[^'\\]|\\.|'(?!''))*\'\'\')
  | (?P<short>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')
  | (?P<lang>@[A-Za-z]+(?:-[A-Za-z0-9]+)*)
  | (?P<dt>\^\^)
  | (?P<bnode>_:[A-Za-z0-9_.-]*[A-Za-z0-9_-])
  | (?P<num>[+-]?(?:\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+))
  | (?P<pname>(?:[A-Za-z][\w.-]*[\w-]|[A-Za-z])?:(?:[\w:%-](?:[\w.:%-]*[\w:%-])?)?|[A-Za-z][\w-]*)
  | (?P<punct>[\[\]();,.])
''', re.X)


def turtle_triples(text):
    """The triples of a Turtle document (W3C Turtle REC, 2014): the grammar of section 6.5."""
    toks, i = [], 0
    while i < len(text):
        m = TTL_TOKEN.match(text, i)
        if not m:
            refuse(f"turtle: no token at {text[i:i + 40]!r}")
        i = m.end()
        if m.lastgroup != "ws":
            toks.append((m.lastgroup, m.group()))
    prefixes, base, triples, pos, blank = {}, "", [], [0], [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else (None, None)

    def take(want=None):
        t = toks[pos[0]]
        if want and t[1] != want:
            refuse(f"turtle: {want} expected, found {t[1]}")
        pos[0] += 1
        return t

    def fresh():
        blank[0] += 1
        return f"_:b{blank[0]}"

    def iri(tok):
        kind, v = tok
        if kind == "iri":
            return resolve(base, v[1:-1])
        if kind == "pname" and ":" in v:
            p, local = v.split(":", 1)
            if p not in prefixes:
                refuse(f"turtle: undeclared prefix {p}")
            return prefixes[p] + re.sub(r"\\(.)", r"\1", local)
        refuse(f"turtle: an IRI expected, found {v}")

    def term():
        kind, v = peek()
        if kind in ("long", "short", "num") or v in ("true", "false"):
            take()
            if peek()[0] == "lang":
                take()
            elif peek()[0] == "dt":
                take()
                iri(take())
            return ("literal", v)
        if kind == "bnode":
            take()
            return v
        if v == "[":
            take()
            node = fresh()
            if peek()[1] != "]":
                predicates(node)
            take("]")
            return node
        if v == "(":
            take()
            head = node = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"
            items = []
            while peek()[1] != ")":
                items.append(term())
            take(")")
            for item in reversed(items):
                cell = fresh()
                triples.append((cell, RDF_NS + "first", item))
                triples.append((cell, RDF_NS + "rest", node))
                node = cell
            return node if items else head
        return iri(take())

    def predicates(subject):
        while True:
            verb = take()
            p = RDF_TYPE if verb == ("pname", "a") else iri(verb)
            while True:
                triples.append((subject, p, term()))
                if peek()[1] != ",":
                    break
                take()
            while peek()[1] == ";":
                take()
            if peek()[1] in (".", "]", None):
                return

    while pos[0] < len(toks):
        kind, v = peek()
        if v in ("@prefix", "@base") or v.upper() in ("PREFIX", "BASE"):
            take()
            if v.lower().endswith("prefix"):
                name = take()[1]
                prefixes[name[:-1]] = iri(take())
            else:
                base = iri(take())
            if v.startswith("@"):
                take(".")
            continue
        subject = term()
        if peek()[1] != ".":
            predicates(subject)
        take(".")
    return triples


def rdfxml_triples(data):
    """The triples of an RDF/XML document (W3C RDF 1.1 XML Syntax REC, 2014): node and property elements."""
    import xml.etree.ElementTree as ET
    XML_BASE = "{http://www.w3.org/XML/1998/namespace}base"
    rdf = lambda local: "{" + RDF_NS + "}" + local  # noqa: E731
    name = lambda tag: tag[1:].replace("}", "", 1)  # noqa: E731
    triples, blank = [], [0]

    def fresh():
        blank[0] += 1
        return f"_:x{blank[0]}"

    def node(el, base):
        base = resolve(base, el.get(XML_BASE)) if el.get(XML_BASE) else base
        if el.get(rdf("about")) is not None:
            s = resolve(base, el.get(rdf("about")))
        elif el.get(rdf("ID")) is not None:
            s = resolve(base, "#" + el.get(rdf("ID")))
        elif el.get(rdf("nodeID")) is not None:
            s = "_:" + el.get(rdf("nodeID"))
        else:
            s = fresh()
        if el.tag != rdf("Description"):
            triples.append((s, RDF_TYPE, name(el.tag)))
        for k, v in el.attrib.items():
            if k.startswith("{" + RDF_NS) or k.startswith("{http://www.w3.org/XML/1998/namespace}"):
                continue
            if k == rdf("type"):
                triples.append((s, RDF_TYPE, resolve(base, v)))
            else:
                triples.append((s, name(k), ("literal", v)))
        for prop in el:
            p = name(prop.tag)
            pbase = resolve(base, prop.get(XML_BASE)) if prop.get(XML_BASE) else base
            if prop.get(rdf("resource")) is not None:
                triples.append((s, p, resolve(pbase, prop.get(rdf("resource")))))
            elif prop.get(rdf("nodeID")) is not None:
                triples.append((s, p, "_:" + prop.get(rdf("nodeID"))))
            elif prop.get(rdf("parseType")) == "Resource":
                inner = fresh()
                triples.append((s, p, inner))
                wrapper = ET.Element(rdf("Description"), {rdf("nodeID"): inner[2:]})
                wrapper.extend(list(prop))
                node(wrapper, pbase)
            elif len(prop) and prop.get(rdf("parseType")) != "Literal":
                for child in prop:
                    triples.append((s, p, node(child, pbase)))
            else:
                triples.append((s, p, ("literal", prop.text or "")))
        return s

    root = ET.fromstring(data)
    base = root.get(XML_BASE) or ""
    for el in (list(root) if root.tag == rdf("RDF") else [root]):
        node(el, base)
    return triples


def ontology_terms(triples, ns):
    """Every class and property a namespace's own document types, by local name (the order of their IRIs)."""
    typed = {}
    for s, p, o in triples:
        if p == RDF_TYPE and isinstance(s, str) and not s.startswith("_:") and isinstance(o, str):
            typed.setdefault(s, set()).add(o)
    out = []
    for s in sorted(typed):
        if not s.startswith(ns):
            continue
        local = s[len(ns):]
        if not local or "/" in local:
            continue
        if typed[s] & CLASS_TYPES:
            out.append((local, "class"))
        elif typed[s] & PROPERTY_TYPES:
            out.append((local, "property"))
    return out


def iana_registry(text, registry):
    m = re.search(r'<registry id="%s">(.*?)</registry>' % registry, text, re.S)
    if not m:
        refuse(f"no registry {registry}")
    return m.group(1)


def terms_of(read, files):
    """(term, kind) for one reading of a pinned source, in the order the register keeps."""
    data = files[read["source"]]
    how = read["read"]
    if how == "iana-csv":
        names = sorted({r[read["column"]].strip() for r in csvlib.DictReader(io.StringIO(data.decode("utf-8"))) if r[read["column"]].strip()})
        return [(n, read["kind"]) for n in names]
    if how == "iana-headers":
        protocols = "|".join(re.escape(p) for p in read["protocols"])
        names = sorted({m.group(1).strip() for m in re.finditer(r"<record[^>]*>\s*<value>([^<]+)</value>\s*<protocol>(?:%s)</protocol>" % protocols, data.decode("utf-8"))})
        return [(n, read["kind"]) for n in names]
    if how == "iana-records":
        text = data.decode("utf-8")
        tag = read["element"]
        names = {v.strip() for v in re.findall(r"<record[^>]*>.*?<%s>([^<]+)</%s>" % (tag, tag), iana_registry(text, read["registry"]), re.S) if " " not in v.strip()}
        if "contexts" in read:  # object types named in the context column of the properties registry
            for c in re.findall(r"<context>([^<]+)</context>", iana_registry(text, read["contexts"])):
                names.update(x.strip() for x in c.split(",") if x.strip() and " " not in x.strip())
        return [(n, read["kind"]) for n in sorted(names)]
    if how == "turtle":
        return ontology_terms(turtle_triples(data.decode("utf-8")), read["namespace"])
    if how == "rdfxml":
        return ontology_terms(rdfxml_triples(data), read["namespace"])
    refuse(f"no reader {how}")


def as_list(v):
    return [] if v is None else (v if isinstance(v, list) else [v])


def schemaorg_register(graph):
    """Every node of the release, classed as its graph types it: rdfs:Class, rdf:Property, or an enumeration member."""
    sch = {x["@id"]: x for x in graph if x["@id"].startswith("schema:")}
    kinds = lambda x: as_list(x["@type"])  # noqa: E731
    classes = {k: x for k, x in sch.items() if "rdfs:Class" in kinds(x)}
    props = {k: x for k, x in sch.items() if "rdf:Property" in kinds(x)}
    members = {k: x for k, x in sch.items() if k not in classes and k not in props}
    # A type is numbered after all of its parents; ties by name, Thing first.
    parents = {k: sorted(p["@id"] for p in as_list(x.get("rdfs:subClassOf")) if p["@id"] in classes) for k, x in classes.items()}
    order, placed, pending = [], set(), sorted(classes, key=lambda k: (k != "schema:Thing", k))
    while pending:
        ready = sorted((k for k in pending if all(p in placed for p in parents[k])), key=lambda k: (k != "schema:Thing", k))
        if not ready:
            refuse("schema.org hierarchy has a cycle")
        order += ready
        placed.update(ready)
        pending = [k for k in pending if k not in placed]
    tix = {k: i for i, k in enumerate(order)}
    pord = sorted(props)
    pix = {k: i for i, k in enumerate(pord)}

    def status(x):
        part = (x.get("schema:isPartOf") or {}).get("@id", "")
        return 3 if "schema:supersededBy" in x else 1 if "pending" in part else 2 if part else 0

    def refs(x, key, table, what):
        ids = [r["@id"] for r in as_list(x.get(key))]
        missing = [i for i in ids if i.startswith("schema:") and i not in table]
        if missing:
            refuse(f"schema.org {x['@id']} {key} names {missing}, which the release does not define as a {what}")
        return [table[i] for i in ids if i in table]

    trows, tnames = [], []
    for k in order:
        x = classes[k]
        trows.append((tix[k], [tix[p] for p in parents[k]], status(x)))
        tnames.append({"id": k[7:], "label": str(x.get("rdfs:label", k[7:])), "status": status(x)})
    prows, pnames = [], []
    for k in pord:
        x = props[k]
        dom = sorted(set(refs(x, "schema:domainIncludes", tix, "type")))
        rng = sorted(set(refs(x, "schema:rangeIncludes", tix, "type")))
        inv = refs(x, "schema:inverseOf", pix, "property")
        sup = refs(x, "schema:supersededBy", pix, "property")
        if len(inv) > 1 or len(sup) > 1:
            refuse(f"schema.org {k} has more than one inverse or successor")
        none = len(pord)
        prows.append((pix[k], dom, rng, inv[0] if inv else none, sup[0] if sup else none, status(x)))
        pnames.append({"id": k[7:], "label": str(x.get("rdfs:label", k[7:])), "status": status(x)})
    mrows, mnames = [], []
    for k in sorted(members):
        enum = sorted(t for t in kinds(members[k]) if t in tix)
        if not enum:
            refuse(f"schema.org {k} is neither a type, a property nor a member of an enumeration")
        mrows.append(tix[enum[0]])
        mnames.append({"id": k[7:], "enumeration": enum[0][7:]})
    return dict(sch=sch, tix=tix, pix=pix, trows=trows, tnames=tnames, prows=prows, pnames=pnames, mrows=mrows, mnames=mnames)


def crosswalk_rows(so, files):
    keys = [v["key"] for v in VOCAB["vocabularies"]]
    match_kinds = VOCAB["matchKinds"]
    residual = {"class": ("Thing", so["tix"]["schema:Thing"]), "property": ("additionalProperty", so["pix"]["schema:additionalProperty"])}
    rows, names = [], []
    for v in VOCAB["vocabularies"]:
        vi = keys.index(v["key"])
        reads = v["terms"]
        if reads[0]["read"] == "schemaorg-equivalences":
            for k, x in sorted(so["sch"].items()):
                for key, match in reads[0]["matches"].items():
                    for e in as_list(x.get(key)):
                        if k in so["tix"]:
                            rows.append((vi, 0, match_kinds.index(match), so["tix"][k]))
                            names.append({"vocabulary": v["key"], "term": e["@id"], "kind": "class", "match": match, "target": k[7:]})
                        elif k in so["pix"]:
                            rows.append((vi, 1, match_kinds.index(match), so["pix"][k]))
                            names.append({"vocabulary": v["key"], "term": e["@id"], "kind": "property", "match": match, "target": k[7:]})
            continue
        terms = [tuple(t) for t in v.get("also", [])]
        for r in reads:
            terms += terms_of(r, files)
        claims = {"class": v["crosswalk"]["classes"], "property": v["crosswalk"]["properties"]}
        seen = set()
        for term, kind in terms:
            if (term, kind) in seen:
                continue
            seen.add((term, kind))
            claim = claims[kind].get(term)
            if claim:
                match, target = claim
                table = so["tix"] if kind == "class" else so["pix"]
                if "schema:" + target not in table:
                    refuse(f"crosswalk {v['key']}:{term} -> {target}: not a schema.org {'type' if kind == 'class' else 'property'}")
                tgt = table["schema:" + target]
            else:
                match, (target, tgt) = "residual", residual[kind]
            rows.append((vi, 0 if kind == "class" else 1, match_kinds.index(match), tgt))
            names.append({"vocabulary": v["key"], "term": term, "kind": kind, "match": match, "target": target})
        for kind, claimed in claims.items():
            for term in claimed:
                if (term, kind) not in seen:
                    refuse(f"crosswalk names {v['key']}:{term}, which its pinned source does not define")
    return rows, names


# LexLean text as `lexlean fmt` writes it (tools/builder/lean.mjs, `layout`):
# a record stays on one line when it fits in WIDTH columns, else one field per
# line; a term is never broken, except a match, which breaks at its arms.
LEAN_WIDTH = 100


def lean_list(items, t="Nat"):
    s = f"(nil {t})"
    for x in reversed(items):
        s = f"(cons {x} {s})"
    return s


def lean_record(head, fields):
    one = f"{head}{{" + ", ".join(f"{k}: {v}" for k, v in fields) + "}"
    if len(one) <= LEAN_WIDTH and "\n" not in one:
        return one
    return f"{head}{{\n" + ",\n".join(f"  {k}: {v}" for k, v in fields) + "\n}"


def lean_fields(fields):
    one = "[" + ", ".join(fields) + "]"
    return one if len("  fields: " + one + ",") <= LEAN_WIDTH else "[\n" + ",\n".join(f"    {f}" for f in fields) + "\n  ]"


class Lean:
    def __init__(self, conf):
        self.prefix, self.types, self.decls = conf["prefix"], conf["types"], []

    def n(self, name):
        return self.prefix + name[0].upper() + name[1:]

    def t(self, name):
        return self.types.get(name, name)

    def structure(self, name, fields):
        self.decls.append(lean_record("structure", [("name", self.t(name)), ("type_parameters", "[]"), ("parameters", "[]"), ("fields", lean_fields(fields))]))

    def definition(self, name, result, body, parameters="[]", recursive=None):
        fields = [("name", self.n(name)), ("parameters", parameters), ("result", result), ("body", body)]
        self.decls.append(lean_record("definition", fields + ([("recursive_argument", recursive)] if recursive else [])))

    def appender(self, rowtype):
        t, f = self.t(rowtype), self.n(f"append{rowtype}s")
        self.definition(f"append{rowtype}s", f"(List {t})", f"(match front\n    | List.nil => back\n    | List.cons item rest => (cons item ({f} rest back)))",
                        f"[front : (List {t}), back : (List {t})]", "front")

    def chunked(self, name, rowtype, rows):
        """name0..nameK and name = name0 ++ ... ++ nameK, VOCAB['lean']['chunk'] rows each."""
        size = VOCAB["lean"]["chunk"]
        chunks = [rows[k:k + size] for k in range(0, len(rows), size)] or [[]]
        t = self.t(rowtype)
        for k, c in enumerate(chunks):
            self.definition(f"{name}{k}", f"(List {t})", lean_list(c, t))
        body = f"({self.n(name)}{len(chunks) - 1})"
        for k in reversed(range(len(chunks) - 1)):
            body = f"({self.n('append' + rowtype + 's')} ({self.n(name)}{k}) {body})"
        self.definition(name, f"(List {t})", body)

    def module(self, conf):
        head = [f"\\begin{{lexlean}}{{{conf['module']}}}", "\\useglossary{lexlean.std.bool@1.2.0}", "\\useglossary{lexlean.std.nat@1.2.0}",
                "\\useglossary{prism.arch@1.0.0}", f"\\title{{{conf['title']}}}", "\\begin{semanticmodule}"]
        return "\n".join(head + ["\n\n".join(self.decls), "\\end{semanticmodule}", "\\end{lexlean}"]) + "\n"


def vocabulary():
    """{path: text} for the register and its three Lean modules."""
    files = {p["file"]: fetch_pin(p) for p in VOCAB["sources"]}
    S = VOCAB["schemaorg"]
    so = schemaorg_register(json.loads(files[S["source"]].decode("utf-8"))["@graph"])
    frows, fnames = crosswalk_rows(so, files)
    digest = next(p["sha256"] for p in VOCAB["sources"] if p["file"] == S["source"])
    mods = VOCAB["lean"]["modules"]
    out = {}

    L = Lean(mods["schemaorg"])
    L.structure("TypeRow", ["{name: index, type: Nat}", "{name: parents, type: (List Nat)}", "{name: status, type: Nat}"])
    L.structure("PropertyRow", ["{name: index, type: Nat}", "{name: domains, type: (List Nat)}", "{name: ranges, type: (List Nat)}",
                                "{name: inverse, type: Nat}", "{name: supersededBy, type: Nat}", "{name: status, type: Nat}"])
    for t in ("TypeRow", "PropertyRow", "Nat"):
        L.appender(t)
    L.definition("release", "String", json.dumps(S["release"]))
    L.definition("sourceDigest", "String", json.dumps(digest))
    for name, value in (("typeCount", len(so["trows"])), ("propertyCount", len(so["prows"])), ("memberCount", len(so["mrows"]))):
        L.definition(name, "Nat", str(value))
    TR, PR = L.t("TypeRow"), L.t("PropertyRow")
    L.chunked("typeRows", "TypeRow", [f"(record {TR} {{index := {i}, parents := {lean_list(ps)}, status := {st}}})" for i, ps, st in so["trows"]])
    L.chunked("propertyRows", "PropertyRow", [f"(record {PR} {{index := {i}, domains := {lean_list(d)}, ranges := {lean_list(r)}, inverse := {inv}, supersededBy := {sup}, status := {st}}})"
                                              for i, d, r, inv, sup, st in so["prows"]])
    L.chunked("memberRows", "Nat", [str(t) for t in so["mrows"]])
    L.chunked("inverseTable", "Nat", [str(r[3]) for r in so["prows"]])
    L.chunked("successorTable", "Nat", [str(r[4]) for r in so["prows"]])
    out[mods["schemaorg"]["path"]] = L.module(mods["schemaorg"])

    C = Lean(mods["crosswalk"])
    C.structure("TermRow", ["{name: vocabulary, type: Nat}", "{name: kind, type: Nat}", "{name: match, type: Nat}", "{name: target, type: Nat}"])
    C.appender("TermRow")
    for name, value in (("vocabularyCount", len(VOCAB["vocabularies"])), ("termCount", len(frows)),
                        ("residualType", so["tix"]["schema:Thing"]), ("residualProperty", so["pix"]["schema:additionalProperty"])):
        C.definition(name, "Nat", str(value))
    TT = C.t("TermRow")
    C.chunked("termRows", "TermRow", [f"(record {TT} {{vocabulary := {a}, kind := {b}, match := {c}, target := {d}}})" for a, b, c, d in frows])
    out[mods["crosswalk"]["path"]] = C.module(mods["crosswalk"])

    dkeys = [d["key"] for d in VOCAB["domains"]]
    anchors = []
    for d, names in VOCAB["anchors"].items():
        for n in names:
            if "schema:" + n not in so["tix"]:
                refuse(f"anchor {n} is not a schema.org type")
            anchors.append((so["tix"]["schema:" + n], dkeys.index(d)))
    anchors.sort()
    floors = []
    for n, v in sorted(VOCAB["propertyFloors"].items()):
        if "schema:" + n not in so["pix"]:
            refuse(f"property floor {n} is not a schema.org property")
        floors.append((so["pix"]["schema:" + n], v))
    floors.sort()
    A = Lean(mods["anchors"])
    A.structure("Anchor", ["{name: key, type: Nat}", "{name: value, type: Nat}"])
    A.appender("Anchor")
    A.definition("thingIndex", "Nat", str(so["tix"]["schema:Thing"]))
    A.appender("Nat")
    amap, domain = dict(anchors), []
    for i, ps, _ in so["trows"]:  # an unanchored type takes the most protective domain of its parents
        domain.append(amap[i] if i in amap else min([len(dkeys) - 1] + [domain[q] for q in ps]))
    AN = A.t("Anchor")
    A.chunked("domainTable", "Nat", [str(d) for d in domain])
    A.chunked("anchorRows", "Anchor", [f"(record {AN} {{key := {t}, value := {d}}})" for t, d in anchors])
    A.chunked("floorRows", "Anchor", [f"(record {AN} {{key := {p}, value := {v}}})" for p, v in floors])
    out[mods["anchors"]["path"]] = A.module(mods["anchors"])

    register = {
        "spec": "me/vocabulary-register/1",
        "sources": VOCAB["sources"],
        "schemaorg": {"release": S["release"], "types": so["tnames"], "typeParents": [ps for _, ps, _ in so["trows"]], "properties": so["pnames"],
                      "propertyDomains": [r[1] for r in so["prows"]], "propertyRanges": [r[2] for r in so["prows"]], "members": so["mnames"]},
        "vocabularies": [{"key": v["key"], "title": v["title"], "authority": v["authority"]} for v in VOCAB["vocabularies"]],
        "crosswalk": fnames,
        "domains": VOCAB["domains"],
        "anchors": VOCAB["anchors"],
        "propertyFloors": VOCAB["propertyFloors"],
        "statusCodes": S["statusCodes"],
    }
    out[VOCAB["register"]] = json.dumps(register, indent=1, ensure_ascii=False) + "\n"
    return out, so, files



def schemaorg_oracle(so, files, examples):
    """The register against schema.org's own published files: the release's
    whole graph (current terms and the attic), the JSON-LD context that
    "https://schema.org" names, and every example of the release.

    1. The register holds every term of the release's whole graph except
       those the release itself puts in its attic (isPartOf attic.schema.org),
       each node identical in both files.
    2. The context defines exactly the whole graph's terms.
    3. Each example's TYPES line names terms the release defines, and each
       JSON-LD block is read by JSON-LD 1.1 term resolution (section 4.1)
       against the pinned context: its keyword aliases, "@vocab", prefixes
       and compact IRIs. A bare term of a block whose context adds another
       document is that document's when schema.org does not define it; a
       block with no context is in the vocabulary of the file it is an
       example of. Every schema.org term used (key, @type, or a schema.org
       IRI given as a value) must be in the register, or in the attic.
    Returns the counts the register's coverage is stated with.
    """
    O = {o["role"]: o for o in VOCAB["schemaorg"]["oracles"]}
    whole = {x["@id"]: x for x in json.loads(files[O["whole"]["file"]].decode("utf-8"))["@graph"] if x["@id"].startswith("schema:")}
    attic = {k for k, x in whole.items() if (x.get("schema:isPartOf") or {}).get("@id") == "https://attic.schema.org"}
    held = so["sch"]
    problems = [f"{k} is in the release but not the register" for k in sorted(set(whole) - attic - set(held))]
    problems += [f"{k} is in the register but not the release" for k in sorted(set(held) - set(whole))]
    problems += [f"{k} differs from the release" for k in sorted(set(held) & set(whole)) if held[k] != whole[k]]
    problems += [f"{k} is in the attic and the register" for k in sorted(attic & set(held))]
    context = json.loads(files[O["context"]["file"]].decode("utf-8"))["@context"]
    namespaces = {"http://schema.org/", "https://schema.org/"}
    defined = {"schema:" + k for k, v in context.items() if isinstance(v, dict) and str(v.get("@id", "")).startswith("schema:")}
    problems += [f"{k} is in the context but not the release" for k in sorted(defined - set(whole))]
    problems += [f"{k} is in the release but not the context" for k in sorted(set(whole) - defined)]
    names = {k[7:] for k in held}
    old = {k[7:] for k in attic}
    named = used = foreign = retired = 0

    defects = {(d["example"], d["term"]): d for d in VOCAB["schemaorg"]["defects"]}
    seen = set()

    def check(local, eg, t):
        nonlocal used, retired
        used += 1
        if (eg, t) in defects:
            seen.add((eg, t))
        elif local in old:
            retired += 1
        elif local not in names:
            problems.append(f"{eg} uses {t}")

    def scope(ctx, outer):
        vocab, prefixes, aliases, others = outer
        prefixes, aliases = dict(prefixes), dict(aliases)
        for c in as_list(ctx):
            if isinstance(c, str):
                if re.fullmatch(r"https?://(?:[a-z-]+\.)?schema\.org/?", c):
                    vocab = context["@vocab"]
                    prefixes.update({k: v for k, v in context.items() if isinstance(v, str) and re.match(r"^https?://", v)})
                    aliases.update({k: v for k, v in context.items() if isinstance(v, str) and v.startswith("@")})
                else:
                    others = True
            elif isinstance(c, dict):
                for k, v in c.items():
                    if k == "@vocab":
                        vocab = v
                    elif isinstance(v, str) and not k.startswith("@"):
                        prefixes[k] = v
        return vocab, prefixes, aliases, others

    def iri(t, ctx, eg):
        """The IRI a term or compact IRI expands to, or None when another context defines it."""
        nonlocal foreign
        vocab, prefixes, aliases, others = ctx
        if re.match(r"^https?://", t):
            return t
        if ":" in t:
            p, local = t.split(":", 1)
            return prefixes[p] + local if p in prefixes else None
        if vocab in namespaces and others and t not in names and t not in old:
            return None
        return vocab + t if vocab else None

    def term(t, ctx, eg):
        nonlocal foreign
        full = iri(t, ctx, eg)
        ns = next((n for n in namespaces if full and full.startswith(n)), None)
        if ns is None:
            foreign += 1
        else:
            check(full[len(ns):], eg, t)

    def walk(o, ctx, eg):
        if isinstance(o, list):
            for x in o:
                walk(x, ctx, eg)
        elif isinstance(o, dict):
            if "@context" in o:
                ctx = scope(o["@context"], ctx)
            for k, v in o.items():
                k = ctx[2].get(k, k)
                if k == "@type":
                    for t in as_list(v):
                        term(t, ctx, eg)
                elif k in ("@graph", "@reverse"):
                    walk(v, ctx, eg)
                elif not k.startswith("@"):
                    term(k, ctx, eg)
                    walk(v, ctx, eg)
        elif isinstance(o, str) and re.fullmatch(r"https?://schema\.org/[A-Za-z0-9]+", o):
            check(o.rsplit("/", 1)[1], eg, o)

    for block in re.split(r"\n(?=TYPES: #eg-)", examples):
        head = re.match(r"TYPES: (#eg-\d+)([^\n]*)", block)
        if not head:
            continue
        eg = head.group(1)
        for t in re.findall(r"[A-Za-z0-9]+", head.group(2)):
            named += 1
            if t not in names and t not in old:
                problems.append(f"{eg} names {t}")
        m = re.search(r"\nJSON:\s*\n(.*?)(?=\n[A-Z-]+:\s*\n|\Z)", block, re.S)
        for script in re.findall(r'<script type="application/ld\+json">(.*?)</script>', m.group(1) if m else "", re.S):
            walk(json.loads(script), scope("https://schema.org", ("", {}, {}, False)), eg)
    problems += [f"defect {eg} {t} is not in the examples" for eg, t in sorted(set(defects) - seen)]
    if problems:
        refuse(f"schema.org {VOCAB['schemaorg']['release']}'s own files disagree with the register: " + "; ".join(problems[:20]))
    return {"terms": len(held), "attic": len(attic), "contextTerms": len(defined), "examplesNamed": named, "examplesUsed": used, "examplesAttic": retired, "examplesForeign": foreign}



def pair_examples(text, source):
    for row in text.splitlines():
        if not row.strip():
            continue
        pair = json.loads(row)
        if pair.get("genre") == source["genre"]:
            yield json.dumps({"a": pair["sentence1"], "b": pair["sentence2"], "score": pair["score"]}, ensure_ascii=False)


def read_similarity(raw):
    pair = json.loads(raw)
    return {"a": pair["a"], "b": pair["b"], "score": pair["score"]}


corpus, texts = [], {}
for source in SPEC["sources"]:
    text = unpaginate(fetch(source))
    # A verified erratum (the RFC Editor's errata) corrects the published text: what it says it says, once.
    for erratum in source.get("errata", []):
        if erratum["status"] != "Verified" or text.count(erratum["says"]) != 1:
            refuse(f"{source['key']} erratum {erratum['id']} is not a verified correction of text it holds once")
        text = text.replace(erratum["says"], erratum["should"])
    texts[source["key"]] = text
    take = {"dashes": dashes, "vcalendar": objects("VCALENDAR"), "vcard": objects("VCARD"), "headers": headers, "displayed": displayed, "vectors": vectors, "csv": csv_examples, "otc": otc_examples, "patterns": lambda text: pattern_examples(text, source), "markup": lambda text: markup_examples(text, source), "page": page, "recurrences": recurrences, "pairs": lambda text: pair_examples(text, source)}[source["examples"]]
    read = {"message": read_message, "calendar": read_calendar, "contact": read_contact, "headerText": read_displayed, "base64": read_vector, "csv": read_csv, "oneTimeCode": read_otc, "coercive": read_pattern, "accname": read_accname, "feed": read_feed, "recurrence": read_recurrence, "similarity": read_similarity}[source["kind"]]
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
        elif "labels" in source:
            expect["label"] = next(source["labels"][t] for t in expect.get("types", []) if t in source["labels"])
        corpus.append({"id": f"{source['key']}-{n}", "source": source["key"], "kind": source["kind"], "raw": raw, "expect": expect})
    if not kept:
        refuse(f"{source['key']} gave no example at a documentation domain")

ids = {c["id"] for c in corpus}
for d in SPEC.get("debt", []):
    if d["id"] not in ids:
        refuse(f"debt names {d['id']}, which is not an example of any source")

text = json.dumps({"comment": "Generated by tools/oracle/gen.py from app/specs/oracle/spec.json. Do not edit.", "corpus": corpus}, indent=1, ensure_ascii=False) + "\n"

# model/authorities.toml (template/1, CM-03): each pinned source is cited, with
# its checksum, and OR-01 is the evidence the Prism realizes it.
q = lambda s: json.dumps(s, ensure_ascii=False)
rows = [
    "# model/authorities.toml --- what this repository cites rather than proves.",
    "#",
    "# A `some-true` claim is reproduced from an authority and is not established",
    "# here. This file is where the authority is named well enough for a third party",
    "# to find it, with a checksum over the committed artifact when there is one and",
    "# a stated reason when there is not.",
    "#",
    "# `realized_by` lists the conformance IDs that are *evidence* this repository",
    "# realizes the cited fact. Evidence is not proof, and the meta-gate fails the",
    "# build if any document blurs the two registers.",
    "#",
    "# Generated by tools/oracle/gen.py from app/specs/oracle/spec.json. Do not edit:",
    "# a source is cited by pinning it there.",
    "",
    'spec = "template/1"',
]
for source in SPEC["sources"]:
    rows += [
        "",
        "[[authority]]",
        f"id = {q('SRC-' + source['key'].upper())}",
        f"name = {q(source['title'])}",
        f"citation = {q(source['url'])}",
        f"checksum = {q('sha256:' + source['sha256'])}",
        f"statement = {q('The examples ' + source['title'] + ' publishes, as its own grammar reads them')}",
        'realized_by = ["OR-01"]',
    ]
# A classification the Prism's models are made of is cited the same way; its
# evidence is the gate of the generator that makes the model from it.
for source in SPEC.get("classifications", []):
    rows += [
        "",
        "[[authority]]",
        f"id = {q('SRC-' + source['key'].upper())}",
        f"name = {q(source['title'])}",
        f"citation = {q(source['url'])}",
        f"checksum = {q('sha256:' + source['sha256'])}",
        f"statement = {q('Every entity of ' + source['title'] + ', with its code, title and URI, as WHO publishes it; ' + source['licence']['citation'])}",
        'realized_by = ["WP-01"]',
    ]
# A source app/specs/oracle/vcard.json pins beyond these (IANA's vCard Elements registry) is cited
# too; tools/oracle/vcard.py reads it, and VC-01 is the evidence.
pinned = {s["key"] for s in SPEC["sources"]}
for source in json.loads((ROOT / "app/specs/oracle/vcard.json").read_text(encoding="utf-8"))["sources"]:
    if source["key"] in pinned:
        continue
    rows += [
        "",
        "[[authority]]",
        f"id = {q('SRC-' + source['key'].upper())}",
        f"name = {q(source['title'])}",
        f"citation = {q(source['url'])}",
        f"checksum = {q('sha256:' + source['sha256'])}",
        f"statement = {q('The entries ' + source['title'] + ' registers, the full inventory of the standard it serves')}",
        'realized_by = ["VC-01"]',
    ]
for pin in VOCAB["sources"] + VOCAB["schemaorg"]["oracles"]:
    rows += [
        "",
        "[[authority]]",
        f"id = {q('SRC-VOCAB-' + re.sub(r'[^A-Z0-9]+', '-', pin['file'].upper()).strip('-'))}",
        f"name = {q(pin['file'] + ' (' + pin['url'].split('/')[2] + ')')}",
        f"citation = {q(pin['url'])}",
        f"checksum = {q('sha256:' + pin['sha256'])}",
        f"statement = {q('Every term ' + pin['file'] + ' defines, as the vocabulary register reads it')}",
        'realized_by = ["RT-01"]',
    ]
authorities = "\n".join(rows) + "\n"

# The vocabulary register, and schema.org's own files and examples held against it.
generated, schemaorg, vocab_files = vocabulary()
for pin in VOCAB["schemaorg"]["oracles"]:
    vocab_files[pin["file"]] = fetch_pin(pin)
coverage = schemaorg_oracle(schemaorg, vocab_files, texts[VOCAB["schemaorg"]["examples"]])

if "--check" in args:
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        refuse("test/oracle/corpus.json is stale: run python3 -I tools/oracle/gen.py")
    if not AUTHORITIES.exists() or AUTHORITIES.read_text(encoding="utf-8") != authorities:
        refuse("model/authorities.toml is stale: run python3 -I tools/oracle/gen.py")
    for path, body in generated.items():
        if not (ROOT / path).exists() or (ROOT / path).read_text(encoding="utf-8") != body:
            refuse(f"{path} is stale: run python3 -I tools/oracle/gen.py")
    sys.exit(0)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
AUTHORITIES.write_text(authorities, encoding="utf-8")
for path, body in generated.items():
    (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / path).write_text(body, encoding="utf-8")
print(f"oracle: {len(corpus)} examples from {len(SPEC['sources'])} specifications and {len(SPEC.get('classifications', []))} classifications, each a cited authority")
print(f"vocabulary: schema.org {VOCAB['schemaorg']['release']} in full, {coverage['terms']} terms (the release's {coverage['contextTerms']} less its attic of {coverage['attic']}), "
      f"{coverage['examplesUsed']} term uses in its own examples resolved ({coverage['examplesForeign']} of other vocabularies), "
      f"{len(VOCAB['vocabularies']) - 1} other schemas crosswalked from {len(VOCAB['sources']) - 1} pinned files")
