"""PT-01: every part of the Prism answers what, why, who, where, when and how.

    python3 -I tools/parts/gate.py [parts.json product.json coherence.json] [--ledger PATH]

A part is every tracked module of the page (site/**/*.mjs, site/extension/*.js;
not suites, not vendored code) and every module of the model
(app/src/**/*.lex.tex). Each is grounded in the first stratum of
app/specs/parts/spec.json whose paths match it, and its certificate is derived,
never written per part:

  what   its stratum's essence, and what it exports or defines
  why    the stakeholder concerns it answers: a feature that calls it, a
         coherence facet that runs it or the root's dispatch to it names the
         journeys it serves; a part serves whatever the parts that use it
         serve; the page's and the root's entries serve all they use; a proof
         serves what it proves; each journey names the concerns it answers
         (app/specs/product: stakeholders, journeys); a stratum may answer a
         builder's concern itself. And what is obstructed without it.
  who    its stratum's agency (observer, medium, player, verifier), whose
         prime product must divide the full agency's, as in verdant's
         isValidAgencyPrimeProduct
  where  its stratum's boundary
  when   its stratum's regime, or the regimes of the journeys it serves
  how    the suites that reach it through their imports (a suite that drives
         Chromium reaches the page's entries), the features' acceptance
         suites, the proofs that import it, the conformance tests that name
         it, or the kernel itself for a proof or a facet of the model

It refuses: a part no stratum grounds; a part with an unanswered question that
is not in 'debt' exactly as unanswered, or a debt entry that is answered now or
names no part; a concern without a key, or that no journey, 'always' entry or
stratum answers and that is not in the concerns debt; a journey that answers no
concern of the person or names a regime that does not exist; a working journey
no part serves (beyond the journeys debt, which only shrinks); an agency, boundary or regime a stratum names that does not
exist.

With --ledger it also writes every part's certificate as JSON.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/specs"))
import record  # noqa: E402

QUESTIONS = ["what", "why", "who", "where", "when", "how"]


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


def parts_of_repo():
    site = [p for p in tracked("site/*.mjs", "site/extension/*.js") if "/vendor/" not in p and "/worker-runtime/" not in p and not p.endswith(".test.mjs")]
    return sorted(site + tracked("app/src/*.lex.tex"))


SPEC_RE = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+Worker\(\s*(?:new\s+URL\(\s*)?|new\s+URL\(\s*)["'`](\.{1,2}/[^"'`]+?\.m?js)["'`]""")
TWIN_RE = re.compile(r"app/src/([A-Za-z0-9_/]+)\.lex\.tex")
LEX_IMPORT_RE = re.compile(r"\\importmodule\{([A-Za-z0-9_.]+)\}")
EXPORT_RE = re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)", re.M)
EXPORT_LIST_RE = re.compile(r"^export\s*\{([^}]*)\}", re.M)
DEF_RE = re.compile(r"^\s*(?:definition|structure|theorem|inductive)\{\s*name:\s*([A-Za-z0-9_]+)", re.M)
DISPATCH_RE = re.compile(r"facet =\? \(facet([A-Za-z0-9]+)\)\) then \(([A-Za-z0-9_.]+)::")


def lex_path(module):
    return "app/src/" + module.replace(".", "/") + ".lex.tex"


def relative(src, spec):
    target = (ROOT / src).parent / spec
    try:
        return str(target.resolve().relative_to(ROOT.resolve()))
    except ValueError:
        return None


def uses_of(path, text, parts):
    """The parts this part uses: its imports, its workers, and the model module it is generated beside."""
    out = set()
    if path.endswith(".lex.tex"):
        for m in LEX_IMPORT_RE.findall(text):
            if lex_path(m) in parts:
                out.add(lex_path(m))
    else:
        for spec in SPEC_RE.findall(text):
            r = relative(path, spec)
            if r in parts:
                out.add(r)
        head = "\n".join(text.splitlines()[:6])
        for m in TWIN_RE.findall(head):
            if f"app/src/{m}.lex.tex" in parts:
                out.add(f"app/src/{m}.lex.tex")
    out.discard(path)
    return out


def what_of(path, text):
    if path.endswith(".lex.tex"):
        return DEF_RE.findall(text)
    names = EXPORT_RE.findall(text)
    for group in EXPORT_LIST_RE.findall(text):
        names += [n.split(" as ")[-1].strip() for n in group.split(",") if n.strip()]
    return names


def suites_reaching(parts, texts):
    """For each part, the suites whose imports reach it."""
    suites = [p for p in tracked("test/*.test.mjs", "site/*.test.mjs") if "/vendor/" not in p]
    helpers = {p: (ROOT / p).read_text(encoding="utf-8") for p in tracked("test/*.mjs", "site/*.test.mjs") if "/vendor/" not in p}
    reach = {p: set() for p in parts}
    for suite in suites:
        seen, stack = set(), [suite]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            text = texts.get(cur) or helpers.get(cur) or ""
            for spec in SPEC_RE.findall(text):
                r = relative(cur, spec)
                if r and (r in texts or r in helpers):
                    stack.append(r)
            if cur in parts:
                stack.extend(uses_of(cur, text, parts))
            if cur == suite and "chromium" in text:
                stack.extend(ENTRIES & parts)
        for p in seen & parts:
            reach[p].add(suite)
        # A suite may load a part by its path rather than import it (a page script tag).
        own = (ROOT / suite).read_text(encoding="utf-8")
        for p in parts:
            if p in own:
                reach[p].add(suite)
    return reach


ENTRIES = set()


def refusals(spec, product, coherence, parts, ledger=None):
    out = []
    agency = {a["key"]: a for a in spec["agency"]}
    full = 1
    for a in agency.values():
        full *= a["prime"]
    bounds = {b["key"] for b in spec["boundaries"]}
    regimes = {r["key"] for r in spec["regimes"]}
    strata = spec["strata"]
    for s in strata:
        for who in s.get("who", []):
            if who not in agency:
                out.append(f"stratum {s['key']} names agency {who!r}, which does not exist")
        if s.get("where") not in bounds:
            out.append(f"stratum {s['key']} names boundary {s.get('where')!r}, which does not exist")
        for w in s.get("when", []):
            if w not in regimes:
                out.append(f"stratum {s['key']} names regime {w!r}, which does not exist")

    # The trace: stakeholder concerns, the journeys that answer them, the parts that serve those.
    concerns = {}
    for st in product.get("stakeholders", []):
        for c in st.get("concerns", []):
            if not isinstance(c, dict) or not c.get("key") or not c.get("says"):
                out.append(f"stakeholder {st.get('key')} has a concern without a key and what it says: {c!r}")
                continue
            if c["key"] in concerns:
                out.append(f"concern {c['key']} is named twice")
            concerns[c["key"]] = st["key"]
    journeys = {j["key"]: j for j in product.get("journeys", [])}
    answered = set()
    for j in journeys.values():
        a = j.get("answers") or []
        if not a:
            out.append(f"journey {j['key']} answers no concern")
        for c in a:
            if concerns.get(c) != "person":
                out.append(f"journey {j['key']} answers {c!r}, which is no concern of the person")
        answered.update(a)
        if not j.get("when"):
            out.append(f"journey {j['key']} names no regime it happens in")
        for w in j.get("when") or []:
            if w not in regimes:
                out.append(f"journey {j['key']} happens in {w!r}, which is no regime")
    for e in product.get("always", []):
        for c in e.get("answers") or []:
            if c not in concerns:
                out.append(f"always {e['key']} answers {c!r}, which is no concern")
        answered.update(e.get("answers") or [])
    for s in strata:
        for c in s.get("answers", []):
            if concerns.get(c) != "builder":
                out.append(f"stratum {s['key']} answers {c!r}, which is no concern of the builder")
        answered.update(s.get("answers", []))
    owed = spec.get("debt", {}).get("concerns", {})
    for c in concerns:
        if c not in answered and c not in owed:
            out.append(f"concern {c} is answered by no journey, always entry or stratum")
    for c, why in owed.items():
        if c not in concerns:
            out.append(f"concerns debt names {c!r}, which is no concern")
        elif c in answered:
            out.append(f"concern {c} is answered now: remove it from the concerns debt")
        elif not str(why).strip():
            out.append(f"concern {c} is owed without a reason")

    # Grounding.
    texts = {p: (ROOT / p).read_text(encoding="utf-8") for p in parts}
    grounded = {}
    for p in parts:
        for s in strata:
            if any(glob_re(g).match(p) for g in s["paths"]):
                grounded[p] = s
                break
        else:
            out.append(f"part {p} is grounded in no stratum")
    uses = {p: uses_of(p, texts[p], set(parts)) for p in parts}
    for s in strata:
        if s.get("carriedBy"):
            for p, g in grounded.items():
                if g is s and s["carriedBy"] in uses:
                    uses[s["carriedBy"]].add(p)

    # Why: the journeys each part serves.
    serves = {p: set() for p in parts}
    called = {p: set() for p in parts}
    accepted = {p: set() for p in parts}
    for f in product.get("features", []):
        for c in f.get("calls", []):
            file = c.split("#")[0]
            if file in serves:
                serves[file].update(f.get("journeys", []))
                called[file].add(f["key"])
                accepted[file].update(f.get("acceptance", []))
    facet_serves = {k: set(v.get("serves", [])) for k, v in (product.get("facets") or {}).items()}
    for f in coherence.get("facets", []):
        for m in f.get("modules") or []:
            if m in serves:
                serves[m].update(facet_serves.get(f["key"], ()))
    root = lex_path(spec.get("root", "Prism"))
    ENTRIES.clear()
    ENTRIES.add(root)
    for page in tracked("site/*.html"):
        for src in re.findall(r"<script[^>]*\bsrc=\"(\./[^\"]+\.mjs)\"", (ROOT / page).read_text(encoding="utf-8")):
            r = relative(page, src)
            if r in serves:
                ENTRIES.add(r)
    if root in texts:
        for key, module in DISPATCH_RE.findall(texts[root]):
            if lex_path(module) in serves:
                serves[lex_path(module)].update(facet_serves.get(key.lower(), ()))

    def flow():
        changed = True
        while changed:
            changed = False
            for p in parts:
                for q in uses[p]:
                    if not serves[p] <= serves[q]:
                        serves[q] |= serves[p]
                        changed = True

    flow()
    # An entry (the page's script, the model's root) serves all it uses; what
    # it uses that serves nothing of its own (the shell) serves what the entry does.
    for e in ENTRIES:
        if e in serves:
            for q in uses[e]:
                serves[e] |= serves[q]
    shell = [e for e in ENTRIES if e in serves]
    while shell:
        cur = shell.pop()
        for q in uses[cur]:
            if not serves[q]:
                serves[q] = set(serves[cur])
                shell.append(q)
    for p, s in grounded.items():
        if s.get("proves"):
            for q in uses[p]:
                serves[p] |= serves[q]

    reach = suites_reaching(set(parts), texts)
    conformance = {p: (ROOT / p).read_text(encoding="utf-8") for p in tracked("crates/conformance/tests/*.rs")}
    proofs = {p: {q for q, g in grounded.items() if g.get("proves") and p in uses[q]} for p in parts}

    certificates, unanswered = [], {}
    for p in parts:
        s = grounded.get(p)
        if not s:
            continue
        js = sorted(serves[p] & set(journeys), key=record.natural)
        cs = sorted({c for j in js for c in journeys[j].get("answers", [])} | set(s.get("answers", [])))
        who = s.get("who", [])
        product_of = 1
        for w in who:
            product_of *= agency.get(w, {}).get("prime", 1)
        when = sorted(set(s.get("when", [])) | {w for j in js for w in journeys[j].get("when", [])}, key=lambda w: [r["key"] for r in spec["regimes"]].index(w) if w in regimes else len(regimes))
        name = pathlib.Path(p).name.removesuffix(".lex.tex")
        how = sorted(reach[p] | accepted[p] | proofs[p])
        how += sorted(c for c, t in conformance.items() if p in t or (p.endswith(".lex.tex") and re.search(rf"\b{re.escape(name)}\b", t)))
        if s.get("where") == "kernel":
            how.append("lexlean verify")
        cert = {
            "part": p,
            "stratum": s["key"],
            "what": {"is": s.get("what", ""), "has": what_of(p, texts[p])},
            "why": {"concerns": cs, "journeys": js, "features": sorted(called[p], key=record.natural), "without": s.get("without", "")},
            "who": {"agency": who, "product": product_of},
            "where": s.get("where"),
            "when": when,
            "how": how,
        }
        missing = []
        if not cert["what"]["is"]:
            missing.append("what")
        if not cs or not cert["why"]["without"]:
            missing.append("why")
        if not who or product_of <= 1 or full % product_of:
            missing.append("who")
        if cert["where"] not in bounds:
            missing.append("where")
        if not when:
            missing.append("when")
        if not how:
            missing.append("how")
        if missing:
            unanswered[p] = missing
        certificates.append(cert)

    owed_parts = spec.get("debt", {}).get("parts", {})
    for p, missing in unanswered.items():
        if owed_parts.get(p) != missing:
            out.append(f"part {p} does not answer {', '.join(missing)}" + (f" (its debt says {', '.join(owed_parts[p])})" if p in owed_parts else ""))
    for p, missing in owed_parts.items():
        if p not in grounded:
            out.append(f"parts debt names {p}, which is no part")
        elif p not in unanswered:
            out.append(f"part {p} answers every question now: remove it from the parts debt")
    unserved = spec.get("debt", {}).get("journeys", {})
    for j in journeys.values():
        served = any(j["key"] in serves[p] for p in parts)
        if j.get("status") == "works" and not served and not str(unserved.get(j["key"], "")).strip():
            out.append(f"journey {j['key']} works, but no feature or facet names a part that serves it")
        if j["key"] in unserved and served:
            out.append(f"journey {j['key']} is served now: remove it from the journeys debt")
    for k in unserved:
        if k not in journeys:
            out.append(f"journeys debt names {k}, which is no journey")
    if ledger is not None:
        ledger.extend(certificates)
    return out, unanswered


def main(argv):
    ledger_path = None
    if "--ledger" in argv:
        i = argv.index("--ledger")
        ledger_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    paths = argv or ["app/specs/parts/spec.json", "app/specs/product/spec.json", "app/specs/coherence/spec.json"]
    spec, product, coherence = (record.load(ROOT / p) for p in paths)
    ledger = []
    out, unanswered = refusals(spec, product, coherence, parts_of_repo(), ledger)
    if ledger_path:
        pathlib.Path(ledger_path).write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if out:
        sys.exit("parts: refused (PT-01)\n  " + "\n  ".join(out))
    debt = sum(len(v) for v in unanswered.values())
    print(f"parts: {len(ledger)} parts certified; {len(ledger) - len(unanswered)} answer what, why, who, where, when and how, {len(unanswered)} still owe {debt} answers (debt)")


if __name__ == "__main__":
    main(sys.argv[1:])
