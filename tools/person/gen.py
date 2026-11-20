"""The whole-person model, made from WHO's ICF: python3 -I tools/person/gen.py [--check] [--fetch]

The whole person is WHO's ICF release pinned in app/specs/oracle/spec.json
(`classifications`). This reads it, keeps its tabulation byte for byte at
app/specs/oracle/icf/, and refuses a release whose tabulation (csv) and
workbook (OOXML, ECMA-376) disagree on any field. The classification's own
structure, each line and across entities, is refused by generators/person
(GenIcf, GenIcfTree; tools/generators/run.sh, GN-01), whose rows,
site/person/icf-rows.mjs, must be these entities field by field. Every entity
keeps its code, title and URI (licence terms 1.2.3); the model's own functions
in site/person/icf.mjs (GenIcfModule) are marked as the Prism's (1.2.5).
--check writes nothing and refuses a stale copy; the release is read from
app/specs/standards/texts/<sha256>, and only --fetch keeps a pin that is not kept yet.
"""
import csv
import io
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "standards"))
import abnf  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/oracle/spec.json").read_text(encoding="utf-8"))
args = sys.argv[1:]
TEXTS = ROOT / "app/specs/standards/texts"
CHECK = "--check" in args
# --plant FORM OLD NEW: replace OLD by NEW in the release's tabulation, its
# workbook or both (FORM), then run every check and write nothing, so a test can
# show each check refuses the defect it is for.
PLANT = args[args.index("--plant") + 1 : args.index("--plant") + 4] if "--plant" in args else None
FIELDS = ["Foundation URI", "Linearization URI", "Code", "BlockId", "Title", "ClassKind", "DepthInKind", "IsResidual", "BrowserLink", "isLeaf", "CodingNote", "Parent"]


def refuse(why):
    sys.exit(f"person: {why}")


def fetch(url, sha256, headers={"User-Agent": "prism-person-gen"}):
    return abnf.kept_bytes(url, sha256, TEXTS, refuse, "--fetch" in args, headers)


def tabulation(raw):
    """The tabulation's rows, by Python's csv reader: tab-separated, quoted, UTF-8 with a byte order mark."""
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t"))
    head = rows[0]
    if head[: len(FIELDS)] != FIELDS or not head[len(FIELDS)].startswith("Version:"):
        refuse(f"the tabulation's columns are {head}, not the release's")
    return head[len(FIELDS)], [dict(zip(FIELDS, row[: len(FIELDS)])) for row in rows[1:] if row]


def workbook(raw):
    """The workbook's rows, by its Office Open XML parts (ECMA-376): shared strings, then the first sheet's cells."""
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    book = zipfile.ZipFile(io.BytesIO(raw))
    shared = ["".join(t.text or "" for t in si.iter(f"{{{ns['x']}}}t")) for si in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("x:si", ns)]
    sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.find("x:sheetData", ns).findall("x:row", ns):
        cells = {}
        for c in row.findall("x:c", ns):
            column = re.match(r"[A-Z]+", c.get("r")).group(0)
            v = c.find("x:v", ns)
            f = c.find("x:f", ns)
            text = "" if v is None else v.text or ""
            if f is not None:
                text = "=" + (f.text or "")
            elif c.get("t") == "s":
                text = shared[int(text)]
            elif c.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in c.iter(f"{{{ns['x']}}}t"))
            cells[column] = text
        width = max((ord(k) - 64 for k in cells if len(k) == 1), default=0)
        rows.append([cells.get(chr(65 + i), "") for i in range(width)])
    head = rows[0]
    if head[: len(FIELDS)] != FIELDS:
        refuse(f"the workbook's columns are {head}, not the release's")
    return head[len(FIELDS)], [dict(zip(FIELDS, row + [""] * (len(FIELDS) - len(row)))) for row in rows[1:]]


source = SPEC["classifications"][0]
if source["key"] != "icf":
    refuse("the oracle's first classification is not the ICF")
archive = zipfile.ZipFile(io.BytesIO(fetch(source["url"], source["sha256"])))
fetch(source["licence"]["terms"], source["licence"]["termsSha256"])
tab_raw = archive.read(source["tabulation"])
book_raw = archive.read(source["workbook"])
if PLANT:
    form, old, new = PLANT
    if form in ("tabulation", "both"):
        if tab_raw.count(old.encode()) != 1:
            refuse(f"planted text {old!r} is not in the tabulation once")
        tab_raw = tab_raw.replace(old.encode(), new.encode())
    if form in ("workbook", "both"):
        parts = {name: zipfile.ZipFile(io.BytesIO(book_raw)).read(name) for name in zipfile.ZipFile(io.BytesIO(book_raw)).namelist()}
        if parts["xl/sharedStrings.xml"].count(old.encode()) != 1:
            refuse(f"planted text {old!r} is not in the workbook once")
        parts["xl/sharedStrings.xml"] = parts["xl/sharedStrings.xml"].replace(old.encode(), new.encode())
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as z:
            for name, data in parts.items():
                z.writestr(name, data)
        book_raw = out.getvalue()
version, rows = tabulation(tab_raw)
book_version, book_rows = workbook(book_raw)

# The two forms WHO publishes agree on every entity, field by field. The
# workbook gives a link where the tabulation gives the formula that makes it.
if version != book_version or len(rows) != len(book_rows):
    refuse(f"the tabulation ({version}, {len(rows)} entities) and the workbook ({book_version}, {len(book_rows)}) differ")
for n, (a, b) in enumerate(zip(rows, book_rows)):
    for field in FIELDS:
        x, y = a[field], b[field]
        if field == "BrowserLink":
            # The tabulation quotes the formula a spreadsheet would run; the workbook holds it as a formula.
            x = x.replace('""', '"')
        if x != y:
            refuse(f"entity {n + 1}: the tabulation's {field} is {a[field]!r}, the workbook's {b[field]!r}")

# The classification's structure, line by line and across entities, is
# generators/person's to refuse (GenIcf, GenIcfTree); these are its entities.
FOUNDATION = "http://id.who.int/icd/entity/"
LINEAR = "http://id.who.int/icd/release/11/icf/"
entities = []
for row in rows:
    title = row["Title"]
    level = 0
    while title.startswith("- ", 2 * level):
        level += 1
    entities.append([
        row["Foundation URI"][len(FOUNDATION):] or None,
        row["Linearization URI"][len(LINEAR):],
        row["Code"],
        row["BlockId"],
        title[2 * level :],
        level,
        row["ClassKind"],
        int(row["DepthInKind"]) if row["DepthInKind"].isdigit() else row["DepthInKind"],
        row["IsResidual"] == "True",
        row["isLeaf"] == "True",
        row["Parent"][len(FOUNDATION):] or None,
        row["CodingNote"],
    ])

OUT = ROOT / source["model"]  # written by generators/person (icfmodule)
# The release's tabulation, kept byte for byte so the LexLean generator
# (generators/person, tools/generators/run.sh) writes the rows from it; and the
# rows it writes, which must be these entities field by field.
COPY = ROOT / "app/specs/oracle/icf" / source["tabulation"]
ROWS_OUT = OUT.with_name("icf-rows.mjs")
NOTICE = COPY.with_name("NOTICE")
notice = "\n".join([
    f"{source['tabulation']} is from {source['title']},",
    f"exactly as WHO publishes it in {source['url']}",
    f"(SHA-256 {source['sha256']}), unaltered.",
    f"{source['licence']['citation']}.",
    f"Licence terms: {source['licence']['terms']}.",
    "Written by tools/person/gen.py, which refuses a copy that is not the release's.",
    "",
])
if PLANT:
    sys.exit("person: the planted defect was not refused")


def rows_agree():
    """The rows GenIcf wrote are these entities, field by field."""
    lines = ROWS_OUT.read_text(encoding="utf-8").splitlines() if ROWS_OUT.exists() else []
    got = [json.loads(line[len("ROWS.push(") : -len(");")]) for line in lines if line.startswith("ROWS.push(")]
    if got != entities:
        refuse(f"{ROWS_OUT.relative_to(ROOT)} is not the release's entities ({len(got)} rows of {len(entities)}): run tools/generators/run.sh")


if CHECK:
    if not COPY.exists() or COPY.read_bytes() != tab_raw or not NOTICE.exists() or NOTICE.read_text(encoding="utf-8") != notice:
        refuse(f"{COPY.relative_to(ROOT)} is not the release's tabulation: run python3 -I tools/person/gen.py")
    rows_agree()
    sys.exit(0)
COPY.parent.mkdir(parents=True, exist_ok=True)
COPY.write_bytes(tab_raw)
NOTICE.write_text(notice, encoding="utf-8")
print(f"person: ICF {source['release']} ({version.removeprefix('Version:')}), {len(entities)} entities, from both forms of the release")
