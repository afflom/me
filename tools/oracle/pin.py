"""A pinned source: fetched at its SHA-256, refused if it differs; and an RFC's text without its page breaks."""
import gzip
import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile


def refuse(why):
    sys.exit(f"oracle: {why}")


def fetch(source, cache=None):
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
    # A corpus published as a zip archive is pinned as published; what is read
    # of it is the members under the source's "members" folders, as one JSON
    # object from each member's path to its text in the encoding it declares.
    if source["url"].endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            held = {
                name: archive.read(name).decode(source.get("encoding", "utf-8"))
                for name in sorted(archive.namelist())
                if any(name.startswith(folder) for folder in source["members"]) and not name.endswith("/")
            }
        return json.dumps(held, ensure_ascii=False)
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


