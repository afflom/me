"""Every assertion a W3C Implementation Report Plan lists for its Recommendation, each a requirement.

The IRP manifest (for SCXML 1.0, https://www.w3.org/Voice/2013/scxml-irp/manifest.xml)
is the Working Group's own inventory of the Recommendation's testable
statements: each <assert> quotes the normative sentence, names the section it
stands in (specnum) and the test that decides it, marked mandatory or optional.
A mandatory assertion is a MUST, an optional one a MAY, and one whose test is
manual stays a requirement like any other. An id is <key>-<assert id>, the same
number the IRP's test directory carries, so the suite that runs test<id>.txml
marks `enforces: <key>-<id>`.
"""
import re


def requirements(data, standard, inv):
    key = standard["key"]
    out = []
    text = data.decode("utf-8", "replace")
    for m in re.finditer(r'<assert id="(\d+)"\s+specnum="([^"]+)"[^>]*>\s*<!\[CDATA\[(.*?)\]\]>(.*?)</assert>', text, re.S):
        aid, sec, words, body = m.groups()
        conf = re.search(r'conformance="(\w+)"', body)
        out.append({"id": f"{key}-{aid}", "kind": "must" if conf and conf.group(1) == "mandatory" else "may",
                    "ref": sec, "text": " ".join(words.split())})
    return out
