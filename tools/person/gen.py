"""The whole-person model, made from WHO's ICF: python3 -I tools/person/gen.py [--check] [--cache DIR]

The whole person is WHO's ICF release pinned in app/specs/oracle/spec.json
(`classifications`). This fetches it, keeps its tabulation byte for byte at
app/specs/oracle/icf/, and refuses a release whose tabulation (csv) and
workbook (OOXML, ECMA-376) disagree on any field. The classification's own
structure, each line and across entities, is refused by generators/person
(GenIcf, GenIcfTree; tools/generators/run.sh, GN-01), whose rows,
site/person/icf-rows.mjs, must be these entities field by field. Every entity
keeps its code, title and URI (licence terms 1.2.3); the model's own functions
in site/person/icf.mjs are marked as the Prism's (1.2.5).
--check writes nothing and refuses a stale model; --cache DIR keeps fetches.
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
cache = pathlib.Path(args[args.index("--cache") + 1]) if "--cache" in args else None
CHECK = "--check" in args
# --plant FORM OLD NEW: replace OLD by NEW in the release's tabulation, its
# workbook or both (FORM), then run every check and write nothing, so a test can
# show each check refuses the defect it is for.
PLANT = args[args.index("--plant") + 1 : args.index("--plant") + 4] if "--plant" in args else None
FIELDS = ["Foundation URI", "Linearization URI", "Code", "BlockId", "Title", "ClassKind", "DepthInKind", "IsResidual", "BrowserLink", "isLeaf", "CodingNote", "Parent"]


def refuse(why):
    sys.exit(f"person: {why}")


def fetch(key, url, sha256):
    return abnf.pinned_bytes(url, sha256, cache and cache / key, refuse, {"User-Agent": "prism-person-gen"}, 120)


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
archive = zipfile.ZipFile(io.BytesIO(fetch("icf.zip", source["url"], source["sha256"])))
fetch("icd-licence.pdf", source["licence"]["terms"], source["licence"]["termsSha256"])
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

counts = {k: sum(1 for e in entities if e[6] == k) for k in ("chapter", "block", "category")}
release = {
    "title": source["title"],
    "release": source["release"],
    "version": version.removeprefix("Version:"),
    "url": source["url"],
    "sha256": source["sha256"],
    "browser": source["browser"],
    "licence": source["licence"]["name"],
    "licenceUrl": source["licence"]["url"],
    "terms": source["licence"]["terms"],
    "citation": source["licence"]["citation"],
    "foundation": FOUNDATION,
    "linearization": LINEAR,
    "counts": counts,
}
q = lambda v: json.dumps(v, ensure_ascii=False)
lines = [
    "// The whole-person model: WHO's International Classification of Functioning,",
    "// Disability and Health (ICF), every entity of the release pinned in",
    "// app/specs/oracle/spec.json, with its code, title and URI as WHO publishes it.",
    f"// {source['licence']['citation']}.",
    "// Generated by tools/person/gen.py, which refuses a release whose two forms",
    "// disagree or whose structure is not the ICF's. Do not edit.",
    "",
    f"export const RELEASE = Object.freeze({q(release)});",
    "",
    "// Each entity, in the release's order, as generators/person/src/GenIcf.lex.tex",
    "// writes it from the release's tabulation (app/specs/oracle/icf): foundation id",
    "// (none for a residual category, which is only in the linearization), linearization",
    "// id, code, block id, title, level, kind, depth in kind, residual, leaf, parent's",
    "// foundation id (none for a root), coding note.",
    "import { ROWS } from \"./icf-rows.mjs\";",
    "export const FIELDS = Object.freeze([\"id\", \"linear\", \"code\", \"block\", \"title\", \"level\", \"kind\", \"depth\", \"residual\", \"leaf\", \"parent\", \"note\"]);",
    "",
    "// The Prism's own functions over the entities follow (not WHO's: ICF terms 1.2.5).",
    "const INDEX = new Map(ROWS.flatMap(([id], i) => (id ? [[id, i]] : [])));",
    "const entity = (i) => {",
    "  const [id, linear, code, block, title, level, kind, depth, residual, leaf, parent, note] = ROWS[i];",
    "  return Object.freeze({ index: i, uri: id ? RELEASE.foundation + id : null, release: RELEASE.linearization + linear, code, block, title, level, kind, depth, residual, leaf, parent: parent === null ? -1 : INDEX.get(parent), note });",
    "};",
    "export const ENTITIES = Object.freeze(ROWS.map((_, i) => entity(i)));",
    "const BY_CODE = new Map(ENTITIES.filter((e) => e.code).map((e) => [e.code, e]));",
    "const BY_URI = new Map(ENTITIES.flatMap((e) => (e.uri ? [[e.uri, e], [e.release, e]] : [[e.release, e]])));",
    "// The entity a code, or its foundation or linearization URI, names, or null.",
    "export const byCode = (code) => BY_CODE.get(code) ?? null;",
    "export const byUri = (uri) => BY_URI.get(uri) ?? null;",
    "// The entities above one, nearest first.",
    "export function ancestors(e) {",
    "  const out = [];",
    "  for (let p = e.parent; p >= 0; p = ENTITIES[p].parent) out.push(ENTITIES[p]);",
    "  return out;",
    "}",
    "export const childrenOf = (e) => ENTITIES.filter((c) => c.parent === e.index);",
    "// The classification's categories (coded, not qualifiers) and its qualifier scales.",
    "export const CATEGORIES = Object.freeze(ENTITIES.filter((e) => e.kind === \"category\" && !e.code.startsWith(\"q\")));",
    "export const QUALIFIERS = Object.freeze(ENTITIES.filter((e) => e.kind === \"category\" && e.code.startsWith(\"q\")));",
    "// Its four components (the first-level blocks under the ICF categories) and their chapters (the second level).",
    "export const COMPONENTS = Object.freeze(ENTITIES.filter((e) => e.parent >= 0 && ENTITIES[e.parent].parent < 0 && ENTITIES[e.parent].title === \"ICF Category\"));",
    "export const CHAPTERS = Object.freeze(ENTITIES.filter((e) => e.parent >= 0 && COMPONENTS.includes(ENTITIES[e.parent])));",
    "// The component and the chapter an entity is in, or null for a root or a qualifier.",
    "export const componentOf = (e) => [e, ...ancestors(e)].find((a) => COMPONENTS.includes(a)) ?? null;",
    "export const chapterOf = (e) => [e, ...ancestors(e)].find((a) => CHAPTERS.includes(a)) ?? null;",
    "// The facets of the whole person that what arrives is filed under: the",
    "// classification's second-level categories (a component letter and three",
    "// digits), each read by meaning as its title in its chapter's words.",
    "export const FACETS = Object.freeze(CATEGORIES.filter((e) => e.code.length === 4));",
    "export const facetText = (e) => `${e.title} (${chapterOf(e).title})`;",
    "// The facets nearest a meaning vector, nearest first: at most `most`, each at",
    "// least `near`, given the facets' own vectors in FACETS order.",
    "export function nearestFacets(vector, vectors, { near, most = 3, nearness }) {",
    "  if (!vector || !vectors) return [];",
    "  return vectors.map((v, i) => [nearness(vector, v), i]).filter(([c]) => c >= near).sort((a, b) => b[0] - a[0]).slice(0, most).map(([, i]) => FACETS[i].code);",
    "}",
    "",
]
text = "\n".join(lines)
OUT = ROOT / source["model"]
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
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        refuse(f"{source['model']} is stale: run python3 -I tools/person/gen.py")
    rows_agree()
    sys.exit(0)
COPY.parent.mkdir(parents=True, exist_ok=True)
COPY.write_bytes(tab_raw)
NOTICE.write_text(notice, encoding="utf-8")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
print(f"person: ICF {source['release']} ({release['version']}), {counts['category']} categories, {counts['block']} blocks, {counts['chapter']} roots, from both forms of the release")
