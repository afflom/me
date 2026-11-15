"""Every requirement an RFC states in its own key words (BCP 14: RFC 2119, RFC 8174).

A requirement is a sentence of the RFC's prose that uses a key word in capitals
(MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED,
NOT RECOMMENDED, MAY, OPTIONAL), with the section it stands in. A sentence that
only quotes the key words (the BCP 14 boilerplate) is not one. Sections whose
own title says they are not part of the specification (references,
acknowledgments, change logs, differences from an earlier RFC, IANA
registration instructions, authors' addresses, copyright) are left out, and so
are any sections the register lists under "skip".

An id is <key>-<section>-<first eight hex of the sentence's SHA-256>, so it
stays the same as long as the RFC's words do; a sentence said twice in one
section takes -2, -3 after it.
"""
import hashlib
import re

KEY_WORD = re.compile(r"\b(MUST NOT|MUST|SHALL NOT|SHALL|SHOULD NOT|SHOULD|NOT RECOMMENDED|RECOMMENDED|REQUIRED|MAY|OPTIONAL)\b")
QUOTED = re.compile(r'"(MUST|SHALL|SHOULD|MAY|REQUIRED|RECOMMENDED|OPTIONAL)')
LEVEL = {"MUST": "must", "MUST NOT": "must", "REQUIRED": "must", "SHALL": "must", "SHALL NOT": "must",
         "SHOULD": "should", "SHOULD NOT": "should", "RECOMMENDED": "should", "NOT RECOMMENDED": "should",
         "MAY": "may", "OPTIONAL": "may"}
FOOT = re.compile(r"\[Page \d+\]\s*$")
HEADING = re.compile(r"^((?:\d+(?:\.\d+)*)|Appendix [A-Z](?:\.\d+)*)\.?\s+(\S.*)$")
NOT_SPECIFICATION = re.compile(r"reference|acknowledg|change ?log|changes from|differences from|iana considerations|author|contributor|copyright|intellectual property|full copyright", re.I)


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


def requirements(data, standard, inv):
    key = standard["key"]
    skip = set(inv.get("skip", []))
    out, seen = [], {}
    excluded = []
    for sec, title, paras in sections(data.decode("utf-8", "replace")):
        top = sec.split(".")[0]
        if sec in skip or top in skip or any(sec.startswith(s + ".") for s in skip) or NOT_SPECIFICATION.search(title):
            excluded.append(sec)
            continue
        if any(sec.startswith(e + ".") for e in excluded):
            continue
        for para in paras:
            prose = " ".join(para)
            for sentence in re.split(r"(?<=[.;:])\s+(?=[A-Z(\"'])", prose):
                m = KEY_WORD.search(sentence)
                if not m or QUOTED.search(sentence):
                    continue
                sentence = re.sub(r"\s+", " ", sentence).strip()
                base = f"{key}-{sec}-{hashlib.sha256(sentence.encode()).hexdigest()[:8]}"
                seen[base] = seen.get(base, 0) + 1
                rid = base if seen[base] == 1 else f"{base}-{seen[base]}"
                out.append({"id": rid, "kind": LEVEL[m.group(1)], "ref": f"{standard['title'].split(' ')[0]} {standard['title'].split(' ')[1]} {sec}" if standard["title"].startswith("RFC ") else sec, "text": sentence})
    return out
