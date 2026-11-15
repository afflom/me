"""The numbered rules of one section of an RFC, each a requirement.

For a specification that states its definition as a numbered list rather than
in BCP 14 key words (RFC 4180 section 2 defines the CSV format in seven rules
in lower case), each item of that list in the section the register names
("section") is one requirement. An id is <key>-<section>-rule-<n>.
"""
import importlib.util
import pathlib
import re

_spec = importlib.util.spec_from_file_location("bcp14", pathlib.Path(__file__).with_name("bcp14.py"))
bcp14 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bcp14)

ITEM = re.compile(r"^(\d+)\.\s+(.*)$")


def requirements(data, standard, inv):
    out = []
    for sec, _title, paras in bcp14.sections(data.decode("utf-8", "replace")):
        if sec != inv["section"]:
            continue
        current = None
        for para in paras:
            m = ITEM.match(para[0])
            if m:
                current = {"id": f"{standard['key']}-{sec}-rule-{m.group(1)}", "kind": "must", "ref": f"{standard['title'].split(' ')[0]} {standard['title'].split(' ')[1]} {sec} rule {m.group(1)}", "text": " ".join([m.group(2)] + para[1:])}
                out.append(current)
            elif current is not None and not para[0].startswith(("field_name", "aaa", "\"")) and len(para) and para[0][:1].islower():
                current["text"] += " " + " ".join(para)
    if not out:
        raise ValueError(f"{standard['key']}: no numbered rules in section {inv['section']}")
    return out
