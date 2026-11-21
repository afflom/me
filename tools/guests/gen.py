"""The page's standalone decision guests, built from the modules the Prism compiles.

    python3 -I tools/guests/gen.py check            GU-01: every guest is current
    python3 -I tools/guests/gen.py stale            the ids of guests older than their modules
    python3 -I tools/guests/gen.py write ID DIR     the scratch project that builds guest ID
    python3 -I tools/guests/gen.py record ID WASM   take a built core wasm in: copy, pin, lock

app/specs/guests/<facet>/<id>.json is one guest: the core wasm the page's Node
suites open, the file that pins it by SHA-256, the app modules it is built
from (each with its proofs), the dispatch it answers with, and where its
acceptance vectors come from (the builder's prompt, or a spec whose examples
are raw requests). `write` lays out app/'s toolchain files, Foundation, those
modules and a <Guest>App module whose application record routes every request
straight to that dispatch. tools/guests/build.sh builds each stale project in
the locked SDK with no network (lexlean lock, fmt, lock, verify, then prismpm
build) and records `.prism/build/<id>/core-wasm/*.wasm`.

app/specs/guests/<facet>/<id>.lock.json holds, for that guest, the SHA-256 of the project `write`
lays out, less the Foundation modules its entry points never import, and of the wasm built from it.
`check` fails when a guest's modules, vectors or limits changed since it was
built, when its wasm is not the one recorded, or when its pin says otherwise:
no guest the page runs is older than the model. Each site/<facet>/guest.mjs
is written from the spec and lock by generators/guests (GN-01).
"""
import hashlib
import json
import pathlib
import re
import shutil
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "app"
FILES = {p: json.loads(p.read_text()) for p in sorted((APP / "specs/guests").glob("*/*.json"))}
GUESTS = {g["id"]: g for p, g in FILES.items() if not p.name.endswith(".lock.json")}
LOCKS = {g["id"]: p.with_name(f"{g['id']}.lock.json") for p, g in FILES.items() if not p.name.endswith(".lock.json")}


def pascal(s):
    return "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]+", s) if w)


def vectors(g):
    """The acceptance vectors: the prompt's examples, or a raw-request spec's."""
    v = g["vectors"]
    if v.startswith("spec:"):
        return [tuple(e) for p in v[5:].split("+") for e in json.loads((APP / f"specs/{p}/spec.json").read_text())["examples"]]
    return [(e["request"], e["response"]) for e in json.loads((APP / f"prompts/{v}.prompt.json").read_text())["app"]["examples"]]


def limits(g):
    """Request, response and allocation maxima: the guest's own, or the least that holds
    every request of its choice fields and every answer, with the allocation twice the
    request maximum (prismpm PP2009)."""
    if "limits" in g:
        return tuple(g["limits"])
    app = json.loads((APP / f"prompts/{g['vectors']}.prompt.json").read_text())["app"]
    fields = app["fields"]
    need = sum(max(map(len, f["values"])) for f in fields) + len(fields) - 1 if all("values" in f for f in fields) else 128
    req = max(128, need)
    resp = max(16, len("invalid"), *map(len, app["outcomes"]))
    return req, resp, 2 * req


def write(gid, out):
    g = GUESTS[gid]
    out = pathlib.Path(out)
    shutil.rmtree(out, ignore_errors=True)
    (out / "src").mkdir(parents=True)
    for name in ("lakefile.toml", "lean-toolchain", "lake-manifest.json", "prismpm.toml"):
        shutil.copy(APP / name, out / name)
    shutil.copytree(APP / "language", out / "language")
    shutil.copytree(APP / "src/Foundation", out / "src/Foundation")
    # A guest that names its memory is a text-application/2 core: the SDK stdlib's V2 model, byte for byte.
    v2 = "memory" in g and shutil.copytree(APP / "specs/guests/stdlib/Foundation", out / "src/Foundation", dirs_exist_ok=True)
    files = []
    for m in g["modules"]:
        for name in (f"{m}.lex.tex", f"{m}Proofs.lex.tex"):
            if (APP / "src" / name).exists():
                shutil.copy(APP / "src" / name, out / "src" / name)
                files.append(f"src/{name}")
    appm = pascal(gid) + "App"
    toml = (APP / "lexlean.toml").read_text()
    start = toml.index("entrypoints = [")
    end = toml.index("]\n", start) + 2
    entries = sorted([f"src/{appm}.lex.tex", *files])
    (out / "lexlean.toml").write_text(toml[:start] + "entrypoints = [" + ", ".join(f'"{e}"' for e in entries) + "]\n" + toml[end:])
    req, resp, alloc = limits(g)
    h = lambda s: "0x" + s.encode().hex()
    vec = "(nil Foundation.View.Text.V1.Model::AcceptanceVector)"
    for r, a in reversed(vectors(g) + [("", "invalid"), ("x" * (req + 1), "invalid"), ("x" * alloc, "invalid")]):
        vec = f"(cons (record Foundation.View.Text.V1.Model::AcceptanceVector {{request := {h(r)}, response := {h(a)}}}) {vec})"
    module = g["dispatch"].split("::")[0]
    name = f"prism-{gid}"
    (out / f"src/{appm}.lex.tex").write_text(rf"""\begin{{lexlean}}{{{appm}}}
\useglossary{{lexlean.std.bool@1.2.0}}
\useglossary{{lexlean.std.nat@1.2.0}}
\useglossary{{prism.arch@1.0.0}}
\importmodule{{Foundation.Bytes}}
\importmodule{{Foundation.View.Text.V1.Model}}
{"\\importmodule{Foundation.View.Text.V2.Model}" + chr(10) if v2 else ""}\importmodule{{{module}}}
\title{{Text application model}}
\begin{{semanticmodule}}
definition{{
  name: dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: ({g['dispatch']} value),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: application,
  parameters: [],
  result: Foundation.View.Text.V{2 if v2 else 1}.Model::TextApplication,
  body: (record Foundation.View.Text.V{2 if v2 else 1}.Model::TextApplication {{profile := "prismpm/text-application/{2 if v2 else 1}", name := "{name}", cargoName := "{name}", cargoVersion := "0.1.0", cargoDescription := "The {gid} decision of the Prism, on its own.", cargoRepository := "https://github.com/afflom/me", cargoHomepage := "https://afflom.github.io/me/", libraryRoots := (cons "Me.{appm}.dispatch" (nil String)), acceptanceVectors := {vec}, entryRoot := "Me.{appm}.dispatch", coreContract := "hologram:guest/core-wasm@1", requestMaximum := ({req} : UInt32), responseMaximum := ({resp} : UInt32), guestAllocationMaximum := ({alloc} : UInt32),{f" coreMemoryPages := ({g['memory'][0]} : UInt32), coreStackBytes := ({g['memory'][1]} : UInt32)," if v2 else ""} capabilitiesEmpty := true, fatArchive := true, primaryLayer := (0 : UInt8), viewLayer := (1 : UInt8), view := (record Foundation.View.Text.V1.Model::TextView {{title := "{name}", heading := "{name}", inputLabel := "Request", submitLabel := "Decide", outputLabel := "Answer", inputError := "Invalid request", responseError := "Invalid response"}})}})
}}
\end{{semanticmodule}}
\end{{lexlean}}
""")
    return out


def reached(d):
    """What the guest is made of: the project's own files and the modules its entry points import, and no other."""
    src, seen = pathlib.Path(d) / "src", set()
    todo = list(src.glob("*.lex.tex"))
    while todo:
        p = todo.pop()
        if p not in seen and p.is_file():
            seen.add(p)
            todo += [src / (m.replace(".", "/") + ".lex.tex") for m in re.findall(r"\\importmodule\{([^}]+)\}", p.read_text())]
    return sorted(x for x in pathlib.Path(d).rglob("*") if x.is_file() and (src not in x.parents or x in seen))


def tree_digest(d):
    h = hashlib.sha256()
    for p in reached(d):
        rel = p.relative_to(d).as_posix().encode()
        h.update(len(rel).to_bytes(4, "big") + rel)
        data = p.read_bytes()
        h.update(len(data).to_bytes(8, "big") + data)
    return h.hexdigest()


def source(gid):
    with tempfile.TemporaryDirectory() as t:
        return tree_digest(write(gid, pathlib.Path(t) / gid))


def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def pin_line(g):
    """The pin file's line that names this guest's wasm, and the SHA-256 on it."""
    text = (ROOT / g["pin"]).read_text()
    base = pathlib.Path(g["wasm"]).name
    for line in text.splitlines():
        if re.search(rf"['\"/]{re.escape(base)}['\"]", line):
            m = re.search(r"sha256: '([0-9a-f]{64})'", line)
            if m:
                return line, m.group(1)
    sys.exit(f"{g['pin']} pins no {base}")


HELD = {gid: FILES[p] for gid, p in LOCKS.items() if p in FILES}


def problems(gid, held):
    g, out = GUESTS[gid], []
    rec = held.get(gid)
    if not rec:
        return ["never built"]
    if rec["source"] != source(gid):
        out.append("its modules, vectors or limits changed since it was built")
    if sha(ROOT / g["wasm"]) != rec["wasm"]:
        out.append(f"{g['wasm']} is not the wasm recorded")
    if pin_line(g)[1] != rec["wasm"]:
        out.append(f"{g['pin']} pins another wasm")
    return out


def main(argv):
    if argv[:1] == ["write"] and len(argv) == 3:
        print(write(argv[1], argv[2]))
    elif argv[:1] == ["record"] and len(argv) == 3:
        g = GUESTS[argv[1]]
        shutil.copy(argv[2], ROOT / g["wasm"])
        digest = sha(ROOT / g["wasm"])
        line, old = pin_line(g)
        pin = ROOT / g["pin"]
        pin.write_text(pin.read_text().replace(line, line.replace(old, digest)))
        LOCKS[argv[1]].write_text(json.dumps({"source": source(argv[1]), "wasm": digest}, indent=2) + "\n")
        print(f"{argv[1]}: {digest}")
    elif argv == ["stale"]:
        print(" ".join(gid for gid in GUESTS if problems(gid, HELD)))
    elif argv == ["check"]:
        bad = {gid: p for gid in GUESTS if (p := problems(gid, HELD))}
        for gid, p in bad.items():
            print(f"{gid}: {'; '.join(p)}")
        if bad:
            sys.exit("stale guests: rebuild with tools/guests/build.sh")
        print(f"guests: {len(GUESTS)} current")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
