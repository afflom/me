"""WCAG's success criteria from W3C's own machine-readable WCAG (wcag.json).

W3C publishes every success criterion with its number, handle and level at
https://www.w3.org/WAI/WCAG22/wcag.json. A conformance claim is made at a
level (WCAG 2.2, section 5.2.1), so the inventory names the levels it
claims: "levels": ["A", "AA"] takes every criterion at A and at AA. A
criterion with no level is one the standard has made obsolete (4.1.1
Parsing, removed in 2.2) and is never a requirement.
"""
import json


def requirements(data: bytes, standard, inv):
    levels = set(inv.get("levels", ["A", "AA"]))
    wcag = json.loads(data)
    out = []
    for principle in wcag["principles"]:
        for guideline in principle["guidelines"]:
            for sc in guideline["successcriteria"]:
                if sc["level"] not in levels:
                    continue
                out.append({
                    "id": f"{standard['key']}-{sc['num']}",
                    "kind": f"success criterion, level {sc['level']}",
                    "ref": f"https://www.w3.org/TR/WCAG22/#{sc['id']}",
                    "text": sc["handle"],
                })
    return out
