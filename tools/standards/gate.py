"""ST-01: every part of the Prism fully implements the standards it answers to.

    python3 -I tools/standards/gate.py [--check | --write] [--base REF] [--seed KEY]

The register, app/specs/standards/spec.json, names each standard a part of the
Prism answers to, the part paths it governs, and where its own normative text
is pinned. From that text, at its pinned SHA-256, each of the standard's
inventories is extracted mechanically, by a LexLean generator of generators/
(an inventory naming the "generated" file it writes from its "vendored" source,
held by GN-01) or by tools/standards/extract/<extract>.py, into requirements: the standard's own MUST, SHALL, SHOULD and MAY sentences,
its numbered rules, or its registry's elements. Nothing is written by hand.
The requirements are kept in test/standards/requirements.json.

Every pinned text and inventory source is kept in the repository at
app/specs/standards/texts/<sha256>, so the gate (and the LexLean extractors that replace
these Python ones) reads no network: --write fetches a pin that is not kept yet
and keeps it, and --check refuses one that is missing. The bytes are public
upstream text fixed by their hash; PV-01 skips exactly those files.

A requirement is enforced when a suite that reaches a part the standard governs
says so: a line of that suite carrying `enforces: <id>`, or the register's
"enforcedBy" map naming that suite for the id. Every other requirement is debt,
listed in app/specs/standards/debt.json, and the list must match exactly.

It refuses:
  - a pinned text or inventory source that is not the pinned bytes;
  - test/standards/requirements.json when it is not what the pins give;
  - a standard with no pinned text that does not say why ("withheld" when its
    issuer does not publish it freely, "unpinned" naming what it waits on);
  - a "governs" path that matches no part, and an "enforces" id or
    "enforcedBy" entry for no requirement, or in a suite that is not tracked
    or reaches no part the standard governs;
  - a part of the Prism (test/parts/parts.txt, PT-01's parts) that no standard
    governs and that is not listed under "ungoverned" with the reason no
    standard applies, or under "unassigned" (debt, exactly as it stands);
  - an unenforced requirement that the debt does not list, and listed debt
    that is enforced now or names no requirement;
  - with --base REF (pull requests: the base branch), debt that REF did not
    have for a requirement REF already measured, and parts added to
    "unassigned" that REF did not list: the debt only shrinks.

--write rewrites test/standards/requirements.json. --seed KEY lists every
unenforced requirement of a standard as its debt, only for a standard that
has no debt entry yet (a newly registered one). The scoreboard (each
standard's requirements, enforced and debt; each withheld or unpinned
standard; the ungoverned and unassigned parts) goes to stdout and to
$GITHUB_STEP_SUMMARY.
"""
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "app/specs/standards/spec.json"
DEBT = ROOT / "app/specs/standards/debt.json"
REQUIREMENTS = ROOT / "test/standards/requirements.json"
ORACLE = ROOT / "app/specs/oracle/spec.json"
SUITES = ["test/*.test.mjs", "site/*.test.mjs", "crates/conformance/tests/*.rs"]
MARK = re.compile(r"enforces:\s*([A-Za-z0-9._\- ,]+)")

# PT-01's parts and the suites that reach each one, which the LexLean program
# generators/parts writes and GN-01 holds.
PARTS = ROOT / "test/parts/parts.txt"
REACH = ROOT / "test/parts/reach.txt"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def canonical(value):
    return json.dumps(value, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


TEXTS = ROOT / "app/specs/standards/texts"


def fetch(pin, write, refusals, what):
    path = TEXTS / pin["sha256"]
    try:
        if not (path.exists() or write):
            raise OSError(f"it is not kept at {path.relative_to(ROOT)}: run python3 -I tools/standards/gate.py --write")
        data = path.read_bytes() if path.exists() else urllib.request.urlopen(pin["url"], timeout=60).read()
    except OSError as error:
        refusals.append(f"{what}: {pin['url']} could not be read: {error}")
        return None
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin["sha256"]:
        refusals.append(f"{what}: {pin['url']} is {digest}, not the pinned {pin['sha256']}")
        return None
    path.exists() or path.write_bytes(data)
    return data


def extractor(kind):
    for stem in (kind, kind.replace("-", "_")):
        path = ROOT / "tools/standards/extract" / f"{stem}.py"
        if path.exists():
            spec = importlib.util.spec_from_file_location(f"extract_{stem.replace('-', '_')}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    return None


def text_pin(standard, oracle):
    text = standard.get("text")
    if text and "oracle" in text:
        src = oracle.get(text["oracle"])
        return {"url": src["url"], "sha256": src["sha256"]} if src else None
    return text


def generated(standard, inv, refusals):
    """An inventory a LexLean generator writes: its source is vendored at the
    pinned bytes, and the requirements file is a GN-01 output of that source."""
    key, source = standard["key"], inv["source"]
    vendored, path = ROOT / inv["vendored"], ROOT / inv["generated"]
    if not vendored.exists() or hashlib.sha256(vendored.read_bytes()).hexdigest() != source["sha256"]:
        refusals.append(f"{key}: {inv['vendored']} is not {source['url']} at the pinned {source['sha256']}")
        return []
    steps = [step for f in sorted(ROOT.glob("generators/*/steps.json")) for step in load(f)["steps"]]
    if not any(step["output"] == inv["generated"] for step in steps):
        refusals.append(f"{key}: no step of a generators/<program>/steps.json writes {inv['generated']}")
        return []
    if not path.exists():
        refusals.append(f"{key}: {inv['generated']} is missing: run tools/generators/run.sh")
        return []
    got = load(path)
    for r in got:
        if not r["id"].startswith(f"{key}-"):
            refusals.append(f"{key}: {inv['generated']} has requirement {r['id']}, not one of {key}")
    return got


def derive(spec, write, refusals):
    oracle = {s["key"]: s for s in load(ORACLE)["sources"]}
    out = {}
    for standard in spec["standards"]:
        key = standard["key"]
        pin = text_pin(standard, oracle)
        if standard.get("text") and pin is None:
            refusals.append(f"{key}: its text names oracle source {standard['text'].get('oracle')!r}, which the oracle does not pin")
            continue
        if not pin:
            if not (standard.get("withheld") or standard.get("unpinned")):
                refusals.append(f"{key}: no pinned text, and neither 'withheld' nor 'unpinned' says why")
            continue
        reqs = []
        for inv in standard.get("inventories", []):
            if "generated" in inv:
                reqs.extend(generated(standard, inv, refusals))
                continue
            module = extractor(inv["extract"])
            if module is None:
                refusals.append(f"{key}: no extractor tools/standards/extract/{inv['extract']}.py")
                continue
            source = inv.get("source") or pin
            data = fetch(source, write, refusals, key)
            if data is None:
                continue
            try:
                got = module.requirements(data, standard, inv)
            except Exception as error:  # an extractor that cannot read its source refuses
                refusals.append(f"{key}: extractor {inv['extract']} failed: {error}")
                continue
            reqs.extend(got)
        ids = [r["id"] for r in reqs]
        for dup in sorted({i for i in ids if ids.count(i) > 1}):
            refusals.append(f"{key}: requirement id {dup} is extracted twice")
        if not standard.get("inventories"):
            refusals.append(f"{key}: a pinned text with no inventory to extract its requirements")
        out[key] = sorted(reqs, key=lambda r: r["id"])
    return out


def tracked(*patterns):
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "--", *patterns], capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if (ROOT / line).is_file()]


def glob_re(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out, i = out + "(?:[^/]+/)*", i + 3
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + r"\Z")


def governed(spec, parts, refusals):
    by_part = {p: [] for p in parts}
    for standard in spec["standards"]:
        for pattern in standard.get("governs", []):
            rx = glob_re(pattern)
            hits = [p for p in parts if rx.match(p)]
            if not hits:
                refusals.append(f"{standard['key']}: governs {pattern}, which is no part of the Prism")
            for p in hits:
                by_part[p].append(standard["key"])
    return by_part


def enforcement(spec, requirements, parts, by_part, refusals):
    """For each requirement id, the suites that enforce it."""
    reached = {}
    for line in REACH.read_text(encoding="utf-8").splitlines():
        part, suite = line.split(" ")
        if part in parts:
            reached.setdefault(suite, set()).add(part)
    owner = {r["id"]: key for key, reqs in requirements.items() for r in reqs}
    governs = {k: {p for p, ks in by_part.items() if k in ks} for k in set().union(*by_part.values())}
    suites = set(t for t in tracked(*SUITES) if "/vendor/" not in t)
    enforced = {}

    def claim(rid, suite, how):
        key = owner.get(rid)
        if key is None:
            refusals.append(f"{how} names {rid}, which is no requirement of a registered standard")
            return
        if suite not in suites:
            refusals.append(f"{how}: {suite} is not a tracked suite")
            return
        # A Rust conformance test reaches the model through the kernel, so it
        # enforces a standard that governs the model's modules.
        reaches = reached.get(suite, set()) | ({p for p in parts if p.startswith("app/src/")} if suite.endswith(".rs") else set())
        if not reaches & governs.get(key, set()):
            refusals.append(f"{how}: {suite} reaches no part that {key} governs")
            return
        enforced.setdefault(rid, set()).add(suite)

    for suite in sorted(suites):
        for n, line in enumerate((ROOT / suite).read_text(encoding="utf-8").splitlines(), 1):
            for m in MARK.finditer(line):
                for rid in re.split(r"[\s,]+", m.group(1).strip()):
                    if rid:
                        claim(rid, suite, f"{suite}:{n}")
    for standard in spec["standards"]:
        for rid, entry in sorted(standard.get("enforcedBy", {}).items()):
            claim(rid, entry.get("suite", ""), f"{standard['key']} enforcedBy {rid}")
        # A standard may enforce every requirement of a kind alike; an id's own entry comes first.
        by_kind = standard.get("enforcedByKind", {})
        for kind in sorted(by_kind):
            if kind not in {r["kind"] for r in requirements.get(standard["key"], [])}:
                refusals.append(f"{standard['key']} enforcedByKind names {kind!r}, which is the kind of none of its requirements")
        for r in requirements.get(standard["key"], []):
            entry = by_kind.get(r["kind"])
            if entry and r["id"] not in standard.get("enforcedBy", {}):
                claim(r["id"], entry.get("suite", ""), f"{standard['key']} enforcedByKind {r['kind']}")
        # A requirement its suite checks and finds failing is not enforced yet: it stays debt,
        # with why, and the suite fails once it holds so the debt shrinks.
        for rid, why in sorted(standard.get("failing", {}).items()):
            if rid not in enforced:
                refusals.append(f"{standard['key']} lists {rid} as failing, but no suite checks it")
            elif not str(why).strip():
                refusals.append(f"{standard['key']} lists {rid} as failing with no reason")
            enforced.pop(rid, None)
    return enforced


def base_json(ref, path):
    out = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{path.relative_to(ROOT)}"], capture_output=True, text=True)
    return json.loads(out.stdout) if out.returncode == 0 else None


def main(argv):
    check, write = "--check" in argv, "--write" in argv
    base = argv[argv.index("--base") + 1] if "--base" in argv else None
    seed = argv[argv.index("--seed") + 1] if "--seed" in argv else None
    refusals = []
    spec = load(SPEC)
    debt = load(DEBT)
    keys = [s["key"] for s in spec["standards"]]
    refusals += [f"{dup} is registered twice" for dup in sorted({k for k in keys if keys.count(k) > 1})]

    requirements = derive(spec, write, refusals)
    rendered = canonical(requirements)
    if write:
        REQUIREMENTS.write_text(rendered, encoding="utf-8")
    elif not REQUIREMENTS.exists() or REQUIREMENTS.read_text(encoding="utf-8") != rendered:
        refusals.append("test/standards/requirements.json is not what the pinned standards give: run python3 -I tools/standards/gate.py --write")

    parts = PARTS.read_text(encoding="utf-8").split()
    by_part = governed(spec, parts, refusals)
    enforced = enforcement(spec, requirements, parts, by_part, refusals)

    ungoverned = spec.get("ungoverned", {})
    unassigned = spec.get("unassigned", [])
    for p in parts:
        listed = (p in ungoverned) + (p in unassigned)
        if by_part[p] and listed:
            refusals.append(f"{p} is governed by {', '.join(by_part[p])} and must leave 'ungoverned' and 'unassigned'")
        elif not by_part[p] and not listed:
            refusals.append(f"{p} answers to no registered standard: register the standard that governs it, or list it under 'ungoverned' with the reason none applies")
        elif listed > 1:
            refusals.append(f"{p} is both 'ungoverned' and 'unassigned'")
    for p in sorted(set(ungoverned) | set(unassigned)):
        if p not in by_part:
            refusals.append(f"{p} is listed as ungoverned or unassigned but is no part of the Prism")
    refusals += [f"{p} is ungoverned with no reason" for p, why in ungoverned.items() if not str(why).strip()]

    if seed:
        if seed in debt:
            refusals.append(f"--seed {seed}: it has debt already, which only shrinks")
        elif seed not in requirements:
            refusals.append(f"--seed {seed}: no measured standard by that key")
        else:
            debt[seed] = sorted(r["id"] for r in requirements[seed] if r["id"] not in enforced)
            DEBT.write_text(canonical(debt), encoding="utf-8")

    for key, reqs in requirements.items():
        open_ids = {r["id"] for r in reqs if r["id"] not in enforced}
        listed = set(debt.get(key, []))
        refusals += [f"{key}: {rid} is enforced by no suite and is not in the debt" for rid in sorted(open_ids - listed)]
        for rid in sorted(listed - open_ids):
            refusals.append(f"{key}: debt {rid} is {'enforced now' if rid in enforced else 'no requirement'}: take it out of the debt")
    refusals += [f"debt names {key}, which is no measured standard" for key in sorted(set(debt) - set(requirements))]

    if base:
        old_debt = base_json(base, DEBT) or {}
        old_reqs = base_json(base, REQUIREMENTS) or {}
        old_spec = base_json(base, SPEC) or {}
        for key, ids in debt.items():
            if key not in old_reqs:
                continue
            measured = {r["id"] for r in old_reqs[key]}
            for rid in sorted(set(ids) - set(old_debt.get(key, []))):
                if rid in measured:
                    refusals.append(f"{key}: debt {rid} is new on this branch, but {base} measured it already: the debt only shrinks")
        for p in sorted(set(unassigned) - set(old_spec.get("unassigned", []))):
            existed = subprocess.run(["git", "-C", str(ROOT), "cat-file", "-e", f"{base}:{p}"], capture_output=True).returncode == 0
            if existed and old_spec:
                refusals.append(f"{p} is newly unassigned on this branch, but {base} had it: the list only shrinks")

    lines = ["| Standard | Requirements | Enforced | Debt |", "| --- | ---: | ---: | ---: |"]
    for standard in spec["standards"]:
        key = standard["key"]
        if key in requirements:
            reqs = requirements[key]
            done = sum(1 for r in reqs if r["id"] in enforced)
            lines.append(f"| {standard['title']} | {len(reqs)} | {done} | {len(reqs) - done} |")
        else:
            lines.append(f"| {standard['title']} | not measured: {standard.get('withheld') or standard.get('unpinned')} | | |")
    total = sum(len(r) for r in requirements.values())
    done = sum(1 for reqs in requirements.values() for r in reqs if r["id"] in enforced)
    gov = sum(1 for p in parts if by_part[p])
    board = "\n".join(
        [f"ST-01: {done} of {total} requirements of {len(requirements)} measured standards enforced; "
         f"{len(spec['standards']) - len(requirements)} standards not yet measured; "
         f"{gov} of {len(parts)} parts governed, {len(ungoverned)} with no standard, {len(unassigned)} not yet assigned.", ""] + lines)
    print(board)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write("## Standards (ST-01)\n\n" + board + "\n")
    for refusal in refusals:
        print(f"ST-01: {refusal}", file=sys.stderr)
    return 1 if refusals else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
