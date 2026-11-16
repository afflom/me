"""The numbered rules of one section of an RFC, each a requirement.

For a specification that states its definition as a numbered list rather than
in BCP 14 key words (RFC 4180 section 2 defines the CSV format in seven rules
in lower case), each item of that list in the section the register names
("section") is one requirement. An id is <key>-<section>-rule-<n>.
"""
import re

FOOT = re.compile(r"\[Page \d+\]\s*$")
HEADING = re.compile(r"^((?:\d+(?:\.\d+)*)|Appendix [A-Z](?:\.\d+)*)\.?\s+(\S.*)$")


def lines_of(text):
    """The RFC's lines without its page breaks (footer, form feed and running header)."""
    out = []
    for line in text.replace("\r\n", "\n").split("\n"):
        if line.startswith("\f"):
            while out and not out[-1].strip():
                out.pop()
            if out and FOOT.search(out[-1]):
                out.pop()
            out.append(None)
            continue
        if out and out[-1] is None:
            if line.startswith("RFC ") or not line.strip():
                continue
            out.pop()
        out.append(line)
    return [line for line in out if line is not None]


def sections(text):
    """(section, title, paragraphs) for each heading at the left margin."""
    out, sec, title, para, paras = [], None, None, [], []
    for line in lines_of(text):
        m = HEADING.match(line)
        if m and not line.startswith(" ") and "...." not in line:
            if para:
                paras.append(para)
            if sec is not None:
                out.append((sec, title, paras))
            sec, title, para, paras = m.group(1).replace("Appendix ", ""), m.group(2).strip(), [], []
            continue
        if not line.strip():
            if para:
                paras.append(para)
            para = []
            continue
        para.append(line.strip())
    if para:
        paras.append(para)
    if sec is not None:
        out.append((sec, title, paras))
    return out


ITEM = re.compile(r"^(\d+)\.\s+(.*)$")


def requirements(data, standard, inv):
    out = []
    for sec, _title, paras in sections(data.decode("utf-8", "replace")):
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
