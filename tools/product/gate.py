"""PD-03: the product record is complete for everything the Prism has.

app/specs/product/spec.json is the Prism as a product: the person's view and
the system view (ISO/IEC/IEEE 42010), the journeys the person makes (ISO 9241-11
goals with their usability measures), and the debt of system words still on
the screen. This gate refuses the record when the Prism has a part the record
does not place:

- a surface entry (place, act, group, setting, feeder, word, lexicon) with no
  viewpoint, or with one that is neither person nor system, or placed both in
  the surface model and in the record;
- a person-view place whose act, or a person-view feeder whose setting, is in
  the system view (a person's control that drives machinery);
- a root facet in the coherence registry with no product entry, an entry for no
  facet, a facet in the person's view, or a facet that serves no journey or a
  journey that does not exist;
- a journey without its goal, done-state, measure (effectiveness, efficiency
  or satisfaction, with a target), status (works or not yet) or walk, or a walk
  test/product/journeys.mjs does not define;
- a person-view setting the Prism does not require of the person (beyond the
  shrinking 'unrequired' list), or a required setting without its name, reason,
  status, or the surface setting that shows it once it works;
- a debt entry that is not a system word.

usage: python3 -I tools/product/gate.py [product.json surface.json coherence.json journeys.mjs]
"""
import json
import re
import sys

KINDS = {"effectiveness", "efficiency", "satisfaction"}
STATUS = {"works", "not yet"}
VIEWS = {"person", "system"}


def refusals(product, surface, coherence, walks):
    out = []
    view = product.get("surface", {})
    keys = {
        "places": [p["key"] for p in surface["places"]],
        "acts": [a["key"] for a in surface["acts"]],
        "groups": [g["key"] for g in surface["groups"]],
        "settings": [s["key"] for s in surface["settings"]],
        "feeders": [f["key"] for f in surface["feeders"]],
        "words": list(surface["words"]),
        "lexicons": ["labels", "roles"],
    }
    # An entry that carries its own viewpoint in the surface model (PrismSurface)
    # is placed there, once; the record places only the entries that do not.
    own = {kind: {x["key"]: x["viewpoint"] for x in surface[kind] if isinstance(x, dict) and "viewpoint" in x} for kind in ("places", "acts", "groups", "settings", "feeders")}
    for kind, have in keys.items():
        given = view.get(kind, {})
        for key in have:
            if key in own.get(kind, {}):
                if own[kind][key] not in VIEWS:
                    out.append(f"surface {kind[:-1]} '{key}' has viewpoint {own[kind][key]!r}, not person or system")
                if key in given:
                    out.append(f"surface {kind[:-1]} '{key}' carries its viewpoint in the surface model; remove the copy from the product record")
            elif given.get(key) not in VIEWS:
                out.append(f"surface {kind[:-1]} '{key}' has no viewpoint in the product record (person or system)")
        for key in given:
            if key not in have:
                out.append(f"the product record places surface {kind[:-1]} '{key}', which the surface does not have")
    view = {kind: {**view.get(kind, {}), **own.get(kind, {})} for kind in set(view) | set(own)}
    for p in surface["places"]:
        if view.get("places", {}).get(p["key"]) == "person" and view.get("acts", {}).get(p["act"]) == "system":
            out.append(f"person place '{p['key']}' offers act '{p['act']}', which is in the system view")
    for f in surface["feeders"]:
        if view.get("feeders", {}).get(f["key"]) == "person" and f["setting"] != "none" and view.get("settings", {}).get(f["setting"]) == "system":
            out.append(f"person feeder '{f['key']}' is driven by setting '{f['setting']}', which is in the system view")

    journeys = {j.get("key"): j for j in product.get("journeys", [])}
    for key, j in journeys.items():
        for field in ("name", "goal", "done", "walk"):
            if not str(j.get(field, "")).strip():
                out.append(f"journey {key} has no {field}")
        m = j.get("measure", {})
        if m.get("kind") not in KINDS or not str(m.get("says", "")).strip() or not str(m.get("target", "")).strip():
            out.append(f"journey {key} has no usability measure (effectiveness, efficiency or satisfaction, what it counts and its target)")
        if j.get("status") not in STATUS:
            out.append(f"journey {key} has status {j.get('status')!r}, not works or not yet")
        if j.get("walk") and j["walk"] not in walks:
            out.append(f"journey {key} names walk '{j['walk']}', which test/product/journeys.mjs does not define")

    # The front end drives the back end: the person sees only the settings the
    # Prism requires to work, and each required setting names what shows it.
    requires = product.get("requires", {})
    required = requires.get("settings", [])
    shown_by = {}
    for r in required:
        for field in ("key", "name", "why"):
            if not str(r.get(field, "")).strip():
                out.append(f"required setting {r.get('key')!r} has no {field}")
        if r.get("status") not in STATUS:
            out.append(f"required setting {r.get('key')!r} has status {r.get('status')!r}, not works or not yet")
        if r.get("setting") is not None:
            if r["setting"] not in keys["settings"]:
                out.append(f"required setting {r['key']!r} is shown by setting {r['setting']!r}, which the surface does not have")
            shown_by[r["setting"]] = r["key"]
        elif r.get("status") == "works":
            out.append(f"required setting {r['key']!r} works but names no surface setting that shows it")
    unrequired = set(requires.get("unrequired", []))
    for key in keys["settings"]:
        person = view.get("settings", {}).get(key) == "person"
        if person and key not in shown_by and key not in unrequired:
            out.append(f"setting '{key}' is in the person's view but the Prism does not require it of the person: move it to the system view, or name the required setting it shows")
        if key in unrequired and (not person or key in shown_by):
            out.append(f"setting '{key}' is listed as unrequired but no longer is: remove it from 'unrequired'")
    facets = {f["key"] for f in coherence["facets"]}
    given = product.get("facets", {})
    for key in sorted(facets):
        entry = given.get(key)
        if entry is None:
            out.append(f"facet '{key}' is in the Prism but not in the product record: name its viewpoint and the journeys it serves")
            continue
        if entry.get("view") != "system":
            out.append(f"facet '{key}' is a back-end part, so its viewpoint is system, not {entry.get('view')!r}")
        serves = entry.get("serves", [])
        if not serves:
            out.append(f"facet '{key}' serves no journey")
        for j in serves:
            if j not in journeys:
                out.append(f"facet '{key}' serves {j}, which is not a journey")
    for key in sorted(set(given) - facets):
        out.append(f"the product record has facet '{key}', which the coherence registry does not")

    system = set(product.get("machinery", {}).get("terms", []))
    word = lambda k: surface["words"].get(k, "")
    for kind, items, text in (
        ("places", surface["places"], lambda x: x["name"]),
        ("acts", surface["acts"], lambda x: x["word"]),
        ("groups", surface["groups"], lambda x: x["name"]),
        ("settings", surface["settings"], lambda x: x["name"]),
        ("feeders", surface["feeders"], lambda x: word(x["word"])),
    ):
        system |= {text(x) for x in items if view.get(kind, {}).get(x["key"]) == "system" and text(x)}
    system |= {t for k, t in surface["words"].items() if view.get("words", {}).get(k) == "system"}
    for lexicon in ("labels", "roles"):
        if view.get("lexicons", {}).get(lexicon) == "system":
            system |= set(surface[lexicon])
    for term in product.get("debt", []):
        if term not in system:
            out.append(f"debt '{term}' is not a word of the system view")
    return out


def main(argv):
    paths = argv[1:] or ["app/specs/product/spec.json", "app/specs/surface/spec.json", "app/specs/coherence/spec.json", "test/product/journeys.mjs"]
    product, surface, coherence = (json.load(open(p, encoding="utf-8")) for p in paths[:3])
    source = open(paths[3], encoding="utf-8").read()
    body = source.split("export const walks = {", 1)[1] if "export const walks = {" in source else ""
    walks = set(re.findall(r"^  async (\w+)\(", body, re.M))
    out = refusals(product, surface, coherence, walks)
    for line in out:
        print(f"product: {line}", file=sys.stderr)
    if out:
        return 1
    print(f"product: {len(product['journeys'])} journeys, {sum(j['status'] == 'works' for j in product['journeys'])} working; {len(product['facets'])} facets placed; {len(product['debt'])} system words still on the screen")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
