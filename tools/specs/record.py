"""Reads a model record that is kept as parts, so parallel changes never collide.

A record's spec.json holds what is shared; an entry such as
    "journeys": {"parts": "journeys"}
stands for every journeys/<key>.json beside it, one file per entry, read as a
list ordered by key (J2 before J10). With "as": "map" the files are read as a
map from each file's name to its content. A list part's file names its own key,
and the key must match the file's name. A record that already holds its entries
inline (a planted copy written by a test) is read as it is.

usage: from tools/specs/record.py, load(path) -> dict
"""
import json
import pathlib
import re


def natural(name):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]


def load(path):
    path = pathlib.Path(path)
    record = json.loads(path.read_text(encoding="utf-8"))
    for key, value in list(record.items()):
        if not (isinstance(value, dict) and set(value) <= {"parts", "as"} and "parts" in value):
            continue
        folder = path.parent / value["parts"]
        files = sorted(folder.glob("*.json"), key=lambda p: natural(p.stem))
        if value.get("as") == "map":
            record[key] = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in files}
        else:
            entries = []
            for p in files:
                entry = json.loads(p.read_text(encoding="utf-8"))
                if entry.get("key") != p.stem:
                    raise SystemExit(f"{p}: names key {entry.get('key')!r}; a part's key is its file name")
                entries.append(entry)
            record[key] = entries
    return record

