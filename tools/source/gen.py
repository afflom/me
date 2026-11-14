"""Writes the declared services where the page and the extension read them.

    python3 -I tools/source/gen.py          write site/source/declared.mjs
    python3 -I tools/source/gen.py --check  refuse unless both are current
    python3 -I tools/source/gen.py --check --contracts FILE  check FILE's contracts instead

from app/specs/source/services.json, after checking each declaration: a key,
a name, https origins, connect steps of a declared kind with a word of at
most four words and 28 characters, and an outbound mode; and each service's
contract with its site (app/specs/source/contracts.json): the site's own terms
quoted, the live routes it allows (never one PrismSource refuses, none where the
terms bar the extension), history from the site's download, every threat
answered, and a rest with a step for the owner when the site challenges.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "app/specs/source/services.json"
text = SPEC.read_text()
spec = json.loads(text)


def refuse(why):
    sys.exit(f"source: {why}")


kinds = set(spec["kinds"])
ext = spec.get("extension", {})
if not isinstance(ext.get("version"), int) or ext["version"] < 1 or not ext.get("update"):
    refuse("extension must give its version and how to update it")
if not spec.get("browsers") or not all(isinstance(b, str) and b for b in spec["browsers"]):
    refuse("browsers must name at least one browser brand that can load the extension")
seen_keys = set()
for s in spec["services"]:
    if s["key"] in seen_keys:
        refuse(f"{s['key']} is declared twice")
    seen_keys.add(s["key"])
    if not s.get("name"):
        refuse(f"{s['key']} has no name")
    for origin in s["origins"]:
        if not re.fullmatch(r"https://[a-z0-9.-]+/", origin):
            refuse(f"{s['key']} origin {origin!r} is not an https origin ending in /")
    for step in s["connect"]:
        if step["kind"] not in kinds:
            refuse(f"{s['key']} step {step['key']} has kind {step['kind']!r}, which is not declared")
        if step.get("url") and not any(step["url"].startswith(o) for o in s["origins"]):
            refuse(f"{s['key']} step {step['key']} opens {step['url']}, which is off its origins")
        if not step.get("how"):
            refuse(f"{s['key']} step {step['key']} says nothing of how")
        if len(step["word"]) > 28 or len(step["word"].split()) > 4:
            refuse(f"{s['key']} step word {step['word']!r} is longer than a name")
    if not re.fullmatch(r"[a-z][a-z0-9-]*", s["key"]):
        refuse(f"{s['key']} key must be lower-case letters, digits and -")
    if "reading" in s and not (type(s["reading"]) is int and s["reading"] >= 1):
        refuse(f"{s['key']} reading must be a whole number from 1")
    if s.get("out") not in ("approve", "refused"):
        refuse(f"{s['key']} out must be approve or refused")
    for route in s.get("own", []):
        for url in [route.get("list", {}).get("url"), route.get("key", {}).get("url")] + route["item"]["urls"]:
            if url and not any(url.startswith(o) for o in s["origins"]):
                refuse(f"{s['key']} own route URL {url} is off its origins")

# The threat and security model, and the contract with each site
# (app/specs/source/contracts.json): every declared service has one, grounded in
# the site's own words, and the routes it reads by stay within it.
CONTRACTS = pathlib.Path(sys.argv[sys.argv.index("--contracts") + 1]) if "--contracts" in sys.argv else ROOT / "app/specs/source/contracts.json"
contracts = json.loads(CONTRACTS.read_text())
threats = {t["key"] for t in contracts["threats"]}
if not all(t.get("what") and t.get("guard") for t in contracts["threats"]):
    refuse("every threat says what it is and what guards against it")
# The routes PrismSource refuses outright for a service (app/specs/source/spec.json).
model = json.loads((ROOT / "app/specs/source/spec.json").read_text())
barred = set()
for rule in model["rules"]:
    when = {c["field"]: c["value"] for c in rule["when"] if c["op"] == "is"}
    if rule["then"] == "refuse" and set(when) == {"service", "route"}:
        barred.add((when["service"], when["route"]))
day = re.compile(r"\d{4}-\d{2}-\d{2}")
sites = {}
for c in contracts["sites"]:
    key = c["service"]
    if key in sites:
        refuse(f"{key} has two contracts")
    sites[key] = c
    if not c.get("terms"):
        refuse(f"{key} contract quotes none of the site's own terms")
    for term in c["terms"]:
        if not re.fullmatch(r"https://[a-z0-9.-]+/\S*", term.get("url", "")):
            refuse(f"{key} term {term.get('url')!r} is not an https page")
        if not term.get("says") or not term.get("section"):
            refuse(f"{key} term on {term['url']} quotes no words or names no section")
        if not (day.fullmatch(term.get("effective", "")) and day.fullmatch(term.get("read", ""))):
            refuse(f"{key} term on {term['url']} gives no effective and read dates")
        if not set(term.get("bars", [])) <= {"automation", "extension", "crawl"}:
            refuse(f"{key} term on {term['url']} bars something undeclared")
    live = set(c.get("live", []))
    if not live <= {"seen", "own"}:
        refuse(f"{key} live routes must be seen or own")
    for route in live:
        if (key, route) in barred:
            refuse(f"{key} contract allows {route} live, which PrismSource refuses")
    if live and any("extension" in t.get("bars", []) for t in c["terms"]):
        refuse(f"{key} terms bar the extension itself, so its contract has no live route")
    if c.get("history") != "export":
        refuse(f"{key} contract takes history from the site's own download")
    if c.get("risk") not in ("none", "low", "some"):
        refuse(f"{key} risk to the owner's account must be none, low or some under its contract")
    if not c.get("conflict"):
        refuse(f"{key} contract says nothing of where it meets the terms")
    if not set(c.get("threats", [])) == threats:
        refuse(f"{key} contract must answer every threat")
    off = c.get("backoff")
    if live and not (off and off.get("on") and type(off.get("hours")) is int and off["hours"] >= 1 and off.get("step")):
        refuse(f"{key} reads live, so it must rest and show a step when the site challenges it")
for s in spec["services"]:
    c = sites.get(s["key"])
    if not c:
        refuse(f"{s['key']} has no contract in app/specs/source/contracts.json")
    used = {r for r, here in (("seen", s.get("seen")), ("own", s.get("own"))) if here}
    if not used <= set(c["live"]):
        refuse(f"{s['key']} reads by {sorted(used - set(c['live']))}, which its contract does not allow")
    off = c.get("backoff")
    if off and off["step"] not in {step["key"] for step in s["connect"]}:
        refuse(f"{s['key']} rests on a challenge with step {off['step']!r}, which is not one of its connect steps")
    if s.get("export") and c["history"] != "export":
        refuse(f"{s['key']} declares a download its contract does not take")
if set(sites) - seen_keys:
    refuse(f"contracts for undeclared services: {sorted(set(sites) - seen_keys)}")
contracted = {k: {"live": c["live"], "history": c["history"], "risk": c["risk"], "backoff": c["backoff"]} for k, c in sites.items()}

declared = (
    "// Generated by tools/source/gen.py from app/specs/source/services.json. Do not edit.\n"
    f"export const SERVICES = {json.dumps(spec['services'])};\n"
    f"export const KINDS = {json.dumps(spec['kinds'])};\n"
    f"export const STATES = {json.dumps(spec['states'])};\n"
    f"export const BROWSERS = {json.dumps(spec['browsers'])};\n"
    f"export const EXTENSION = {json.dumps(spec['extension'])};\n"
    f"export const CONTRACTS = {json.dumps(contracted, ensure_ascii=False)};\n"
)
outputs = {ROOT / "site/source/declared.mjs": declared}
if "--check" in sys.argv:
    for path, want in outputs.items():
        if not path.exists() or path.read_text() != want:
            refuse(f"{path.relative_to(ROOT)} is stale: run python3 -I tools/source/gen.py")
    print(f"source: {len(spec['services'])} services current")
else:
    for path, want in outputs.items():
        path.write_text(want)
    print(f"source: wrote site/source/declared.mjs for {len(spec['services'])} services")
