"""ST-01: every part of the Prism fully implements the standards it answers to.

    python3 -I tools/standards/gate.py [--check | --write] [--base REF] [--cache DIR] [--seed KEY]

The register, app/specs/standards/spec.json, names each standard a part of the
Prism answers to, the part paths it governs, and where its own normative text
is pinned. From that text, at its pinned SHA-256, each of the standard's
inventories is extracted mechanically by tools/standards/extract/<extract>.py
into requirements: the standard's own MUST, SHALL, SHOULD and MAY sentences,
its numbered rules, or its registry's elements. Nothing is written by hand.
The requirements are kept in test/standards/requirements.json.

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
  - a part of the Prism (tools/parts/gate.py's parts) that no standard
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

_parts_spec = importlib.util.spec_from_file_location("parts_gate", ROOT / "tools/parts/gate.py")
parts_gate = importlib.util.module_from_spec(_parts_spec)
_parts_spec.loader.exec_module(parts_gate)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def canonical(value):
    return json.dumps(value, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def fetch(pin, cache, refusals, what):
    path = cache / pin["sha256"] if cache else None
    if path and path.exists():
        data = path.read_bytes()
    else:
        try:
            with urllib.request.urlopen(pin["url"], timeout=60) as response:
                data = response.read()
        except OSError as error:
            refusals.append(f"{what}: {pin['url']} could not be read: {error}")
            return None
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin["sha256"]:
        refusals.append(f"{what}: {pin['url']} is {digest}, not the pinned {pin['sha256']}")
        return None
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
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


def derive(spec, cache, refusals):
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
            module = extractor(inv["extract"])
            if module is None:
                refusals.append(f"{key}: no extractor tools/standards/extract/{inv['extract']}.py")
                continue
            source = inv.get("source") or pin
            data = fetch(source, cache, refusals, key)
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
    return parts_gate.tracked(*patterns)


def governed(spec, parts, refusals):
    by_part = {p: [] for p in parts}
    for standard in spec["standards"]:
        for pattern in standard.get("governs", []):
            rx = parts_gate.glob_re(pattern)
            hits = [p for p in parts if rx.match(p)]
            if not hits:
                refusals.append(f"{standard['key']}: governs {pattern}, which is no part of the Prism")
            for p in hits:
                by_part[p].append(standard["key"])
    return by_part


def enforcement(spec, requirements, parts, by_part, refusals):
    """For each requirement id, the suites that enforce it."""
    texts = {p: (ROOT / p).read_text(encoding="utf-8") for p in parts}
    # A suite that drives Chromium reaches the page's entries, as in PT-01.
    parts_gate.ENTRIES.clear()
    for page in tracked("site/*.html"):
        for src in re.findall(r"<script[^>]*\bsrc=\"(\./[^\"]+\.mjs)\"", (ROOT / page).read_text(encoding="utf-8")):
            r = parts_gate.relative(page, src)
            if r in texts:
                parts_gate.ENTRIES.add(r)
    reach = parts_gate.suites_reaching(set(parts), texts)
    reached = {}
    for part, suites in reach.items():
        for suite in suites:
            reached.setdefault(suite, set()).add(part)
    owner = {r["id"]: key for key, reqs in requirements.items() for r in reqs}
    governs = {}
    for part, keys in by_part.items():
        for key in keys:
            governs.setdefault(key, set()).add(part)
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
    return enforced


def base_json(ref, path):
    out = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{path.relative_to(ROOT)}"], capture_output=True, text=True)
    return json.loads(out.stdout) if out.returncode == 0 else None


def main(argv):
    check, write = "--check" in argv, "--write" in argv
    cache = pathlib.Path(argv[argv.index("--cache") + 1]) if "--cache" in argv else None
    base = argv[argv.index("--base") + 1] if "--base" in argv else None
    seed = argv[argv.index("--seed") + 1] if "--seed" in argv else None
    refusals = []
    spec = load(SPEC)
    debt = load(DEBT)
    keys = [s["key"] for s in spec["standards"]]
    for dup in sorted({k for k in keys if keys.count(k) > 1}):
        refusals.append(f"{dup} is registered twice")

    requirements = derive(spec, cache, refusals)
    rendered = canonical(requirements)
    if write:
        REQUIREMENTS.parent.mkdir(parents=True, exist_ok=True)
        REQUIREMENTS.write_text(rendered, encoding="utf-8")
    elif not REQUIREMENTS.exists() or REQUIREMENTS.read_text(encoding="utf-8") != rendered:
        refusals.append("test/standards/requirements.json is not what the pinned standards give: run python3 -I tools/standards/gate.py --write")

    parts = parts_gate.parts_of_repo()
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
    for p, why in ungoverned.items():
        if not str(why).strip():
            refusals.append(f"{p} is ungoverned with no reason")

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
        for rid in sorted(open_ids - listed):
            refusals.append(f"{key}: {rid} is enforced by no suite and is not in the debt")
        for rid in sorted(listed - open_ids):
            refusals.append(f"{key}: debt {rid} is {'enforced now' if rid in enforced else 'no requirement'}: take it out of the debt")
    for key in sorted(set(debt) - set(requirements)):
        refusals.append(f"debt names {key}, which is no measured standard")

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
