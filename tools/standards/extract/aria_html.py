"""WAI-ARIA's roles, states and properties from the W3C Recommendation itself.

The Recommendation (https://www.w3.org/TR/wai-aria-1.2/) defines each role in
a section of class "role" headed by its name, and each state and property
in one headed by a "state-name" or "property-name". A role the text calls
abstract ("an abstract role used for the ontology") is one authors must
not use; every other role, state and property is one the page must use as
the Recommendation says wherever it uses it.
"""
import html
import re


def requirements(data: bytes, standard, inv):
    text = data.decode("utf-8")
    key = standard["key"]
    out = []
    sections = re.split(r'(?=<section class="role[^"]*" id=")', text)
    for section in sections:
        m = re.match(r'<section class="role[^"]*" id="([a-z]+)"', section)
        if not m:
            continue
        name = m.group(1)
        body = section.split("</section>", 1)[0]
        abstract = "abstract role" in re.sub(r"<[^>]+>", "", body)
        out.append({
            "id": f"{key}-role-{name}",
            "kind": "abstract role" if abstract else "role",
            "ref": f"{standard['text']['url']}#{name}",
            "text": f"the {name} role" + (", which authors must not use" if abstract else ""),
        })
    for kind in ("state", "property"):
        for name in sorted(set(re.findall(rf'class="{kind}-name" title="(aria-[a-z]+)"', text))):
            out.append({
                "id": f"{key}-{name}",
                "kind": kind,
                "ref": f"{standard['text']['url']}#{name}",
                "text": html.unescape(f"the {name} {kind}"),
            })
    return out
