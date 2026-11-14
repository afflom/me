"""Writes a record that holds its entries inline back out as parts.

For merging a branch that still edits a record whole (spec.json with every
journey or facet inline) into one kept as parts: take that side's spec.json,
then run
    python3 -I tools/specs/split.py app/specs/product/spec.json [inline.json]
The parts named in the committed spec.json ({"parts": dir}) are rewritten from
the inline record (inline.json, or spec.json itself when it holds them), one
file per entry, entries it no longer has are removed, and spec.json keeps only
what is shared.

usage: python3 -I tools/specs/split.py SPEC [INLINE]
"""
import json
import pathlib
import subprocess
import sys

spec = pathlib.Path(sys.argv[1])
inline = json.loads(pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else spec).read_text(encoding="utf-8"))
# The shape (which keys are parts) comes from the committed record.
shape = json.loads(subprocess.run(["git", "show", f"HEAD:{spec.as_posix()}"], capture_output=True, text=True, check=True).stdout)
dump = lambda v: json.dumps(v, indent=2, ensure_ascii=False) + "\n"
head = {}
for key, value in inline.items():
    marker = shape.get(key)
    if isinstance(marker, dict) and "parts" in marker and not (isinstance(value, dict) and "parts" in value):
        folder = spec.parent / marker["parts"]
        folder.mkdir(exist_ok=True)
        entries = value.items() if marker.get("as") == "map" else ((e["key"], e) for e in value)
        keep = set()
        for name, entry in entries:
            (folder / f"{name}.json").write_text(dump(entry), encoding="utf-8")
            keep.add(name)
        for old in folder.glob("*.json"):
            if old.stem not in keep:
                old.unlink()
        value = marker
    head[key] = value
if "comment" in shape:
    head["comment"] = shape["comment"]
spec.write_text(dump(head), encoding="utf-8")
print(f"{spec}: {sum(1 for v in head.values() if isinstance(v, dict) and 'parts' in v)} parts written")
