"""The whole-person model, made from WHO's ICF: python3 -I tools/person/gen.py [--check] [--cache DIR]

A twin of a person needs a model of the whole person. The Prism's is the
International Classification of Functioning, Disability and Health (ICF), as
WHO publishes it in its classification release, pinned in
app/specs/oracle/spec.json under `classifications`: the release's archive by
SHA-256, its licence terms by SHA-256.

The release carries the classification twice, as a tab-separated tabulation
and as a workbook. Each is read by its own reader (the tabulation by Python's
csv module, the workbook by its Office Open XML parts, ECMA-376), and the two
must agree on every entity, field by field, or nothing is written. The
classification is then held to its own structure, or refused:
  - every entity's parent is an entity of the release, and there is exactly
    one root per tabulation (the ICF categories and the ICF qualifiers);
  - a block's or category's title carries one "- " per level below its root,
    which the tabulation uses to draw the hierarchy (the model keeps the title
    without it);
  - a category's code begins with its component's letter (b, s, d, e; q for
    a qualifier), and a category under a category extends its parent's code
    by one level (ICF 2001, coding conventions: one digit for a chapter, two
    for the second level, one each for the third and fourth);
  - DepthInKind counts the categories above it plus one, IsLeaf holds exactly
    when no entity names it as parent, and codes and URIs are unique;
  - its URIs are WHO's entity and linearization URIs for the entity's own id.

What the model keeps of each entity is every field of the release except the
browser link (a spreadsheet formula, which is the URI again): its foundation
URI, linearization URI, code, block id, title, kind, depth in kind, residual,
leaf, coding note and parent, so every stored entity keeps its code, title
and URI as the licence requires (terms 1.2.3). Nothing is added to an entity;
the model's own functions over the entities are marked as the Prism's.

Writes site/person/icf.mjs, which the page loads. --check writes nothing and
refuses a stale model. --cache DIR reads and keeps the fetched files there.
"""
import csv
import hashlib
import io
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

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
COMPONENTS = {"b": "Body functions", "s": "Body structures", "d": "Activities and participation", "e": "Environmental factors"}


def refuse(why):
    sys.exit(f"person: {why}")


def fetch(key, url, sha256):
    path = cache / key if cache else None
    if path and path.exists():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(url, headers={"User-Agent": "prism-person-gen"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != sha256:
        refuse(f"{url} is {digest}, not the pinned {sha256}")
    return data


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

# The classification, held to its own structure.
FOUNDATION = "http://id.who.int/icd/entity/"
LINEAR = "http://id.who.int/icd/release/11/icf/"
by_uri = {}
for n, row in enumerate(rows):
    uri, linear = row["Foundation URI"], row["Linearization URI"]
    if row["ClassKind"] not in ("chapter", "block", "category"):
        refuse(f"entity {n + 1} is of kind {row['ClassKind']}")
    if row["IsResidual"] not in ("True", "False") or row["isLeaf"] not in ("True", "False") or not row["DepthInKind"].isdigit():
        refuse(f"entity {n + 1} has a flag or depth that is not one")
    if uri:
        if not uri.startswith(FOUNDATION) or not uri[len(FOUNDATION):].isdigit():
            refuse(f"entity {n + 1}'s foundation URI {uri} is not a WHO entity URI")
        if linear != LINEAR + uri[len(FOUNDATION):]:
            refuse(f"{uri}'s linearization URI {linear} is not its own")
    else:
        # A residual category (other specified, unspecified) exists only in the
        # linearization: its URI is its parent's, then /other or /unspecified.
        parent = row["Parent"]
        if row["IsResidual"] != "True" or not parent.startswith(FOUNDATION) or linear not in (LINEAR + parent[len(FOUNDATION):] + "/other", LINEAR + parent[len(FOUNDATION):] + "/unspecified"):
            refuse(f"entity {n + 1} ({linear}) has no foundation URI and is not a residual of its parent")
    if linear in by_uri or (uri and uri in by_uri):
        refuse(f"{linear} is in the release twice")
    by_uri[linear] = n
    if uri:
        by_uri[uri] = n
children = {}
for row in rows:
    if row["Parent"]:
        if row["Parent"] not in by_uri:
            refuse(f"{row['Linearization URI']}'s parent {row['Parent']} is not in the release")
        children.setdefault(rows[by_uri[row["Parent"]]]["Linearization URI"], []).append(row["Linearization URI"])
roots = [row for row in rows if not row["Parent"]]
if [r["Title"] for r in roots] != ["ICF Category", "ICF Qualifier"] or any(r["ClassKind"] != "chapter" for r in roots):
    refuse(f"the release's roots are {[r['Title'] for r in roots]}, not the ICF categories and qualifiers")

codes = set()
entities = []
for n, row in enumerate(rows):
    uri = row["Foundation URI"] or row["Linearization URI"]
    chain = []
    up = row["Parent"]
    while up:
        chain.append(rows[by_uri[up]])
        up = rows[by_uri[up]]["Parent"]
    level = len(chain)
    title = row["Title"]
    if not title.startswith("- " * level) or title[2 * level :].startswith("- ") or not title[2 * level :].strip():
        refuse(f"{uri}'s title {title!r} does not carry its {level} levels")
    title = title[2 * level :]
    code = row["Code"]
    kind = row["ClassKind"]
    if kind == "category":
        if not code or code in codes:
            refuse(f"{uri} is a category with code {code!r}, empty or seen before")
        codes.add(code)
        root = chain[-1]["Title"]
        letter = code[0]
        if root == "ICF Category":
            # The component is the first-level block above it, and its letter leads the code.
            component = chain[-2]["Title"][2:]
            if COMPONENTS.get(letter) != component:
                refuse(f"{code} is under {component}, not {COMPONENTS.get(letter)}")
            if not re.fullmatch(r"[bsde][1-9]\d{2}\d{0,2}", code):
                refuse(f"{code} is not an ICF category code")
        elif not re.fullmatch(r"q[bfcmps]\d", code):
            refuse(f"{code} is not an ICF qualifier code")
        above = [c for c in chain if c["ClassKind"] == "category"]
        if int(row["DepthInKind"]) != len([c for c in chain if c["ClassKind"] == "category"]) + 1:
            refuse(f"{code}'s depth in kind is {row['DepthInKind']}, not {len(above) + 1}")
        if above and not (code.startswith(above[0]["Code"]) and len(code) == len(above[0]["Code"]) + 1):
            refuse(f"{code} does not extend its parent {above[0]['Code']} by one level")
    elif code:
        refuse(f"{uri} is a {kind} with code {code}")
    leaf = row["isLeaf"] == "True"
    if leaf != (row["Linearization URI"] not in children):
        refuse(f"{uri} says it is {'a leaf' if leaf else 'not a leaf'}, but {len(children.get(row['Linearization URI'], []))} entities name it as parent")
    entities.append([
        row["Foundation URI"][len(FOUNDATION):] or None,
        row["Linearization URI"][len(LINEAR):],
        code,
        row["BlockId"],
        title,
        kind,
        int(row["DepthInKind"]),
        row["IsResidual"] == "True",
        leaf,
        by_uri[row["Parent"]] if row["Parent"] else -1,
        row["CodingNote"],
    ])

counts = {k: sum(1 for e in entities if e[5] == k) for k in ("chapter", "block", "category")}
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
    "// Each entity, in the release's order: foundation id (none for a residual",
    "// category, which is only in the linearization), linearization id, code, block id, title,",
    "// kind, depth in kind, residual, leaf, parent (its index, or -1), coding note.",
    "export const FIELDS = Object.freeze([\"id\", \"linear\", \"code\", \"block\", \"title\", \"kind\", \"depth\", \"residual\", \"leaf\", \"parent\", \"note\"]);",
    "const ROWS = [",
    *[f"  {q(e)}," for e in entities],
    "];",
    "",
    "// The Prism's own functions over the entities follow (not WHO's: ICF terms 1.2.5).",
    "const entity = (i) => {",
    "  const [id, linear, code, block, title, kind, depth, residual, leaf, parent, note] = ROWS[i];",
    "  return Object.freeze({ index: i, uri: id ? RELEASE.foundation + id : null, release: RELEASE.linearization + linear, code, block, title, kind, depth, residual, leaf, parent, note });",
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
    "",
]
text = "\n".join(lines)
OUT = ROOT / source["model"]
if PLANT:
    sys.exit("person: the planted defect was not refused")
if CHECK:
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        refuse(f"{source['model']} is stale: run python3 -I tools/person/gen.py")
    sys.exit(0)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
print(f"person: ICF {source['release']} ({release['version']}), {counts['category']} categories, {counts['block']} blocks, {counts['chapter']} roots, from both forms of the release")
