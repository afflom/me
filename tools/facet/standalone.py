"""Writes a scratch LexLean project that builds one facet as its own guest.

    python3 -I tools/facet/standalone.py app/specs/<facet>/spec.json DIR

DIR gets app/'s toolchain files, Foundation, the facet module (+Proofs) and an
<Facet>App module whose application record routes every request straight to
<Module>::<prefix>Dispatch (tools/dest/standalone.py, generalized). In the locked SDK image, with no network:

    lexlean fmt && lexlean lock && lexlean verify && prismpm build

The core wasm it builds is site/<prefix>/guest/<prefix>.wasm, pinned by SHA-256 in
site/<prefix>/guest.mjs. Its vectors are the spec's examples plus the limits.
"""
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "app"
SPEC = json.loads((ROOT / sys.argv[1]).read_text())
P, MOD = SPEC["facet"]["prefix"], SPEC["facet"]["module"]
APPM = P[0].upper() + P[1:] + "App"
REQ_MAX, RESP_MAX, ALLOC = 128, 16, 256

out = pathlib.Path(sys.argv[2])
if out.exists():
    shutil.rmtree(out)
(out / "src").mkdir(parents=True)
for name in ("lakefile.toml", "lean-toolchain", "lake-manifest.json", "prismpm.toml"):
    shutil.copy(APP / name, out / name)
shutil.copytree(APP / "language", out / "language")
shutil.copytree(APP / "src/Foundation", out / "src/Foundation")
for name in (f"{MOD}.lex.tex", f"{MOD}Proofs.lex.tex"):
    shutil.copy(APP / "src" / name, out / "src" / name)

toml = (APP / "lexlean.toml").read_text()
start = toml.index("entrypoints = [")
end = toml.index("]\n", start) + 2
entries = sorted([f"src/{APPM}.lex.tex", f"src/{MOD}.lex.tex", f"src/{MOD}Proofs.lex.tex"])
toml = toml[:start] + "entrypoints = [" + ", ".join(f'"{e}"' for e in entries) + "]\n" + toml[end:]
(out / "lexlean.toml").write_text(toml)

h = lambda s: "0x" + s.encode().hex()
vectors = [(r, a) for r, a in SPEC["examples"]]
vectors += [("", "invalid"), ("x" * (REQ_MAX + 1), "invalid"), ("x" * ALLOC, "invalid")]
vec = "(nil Foundation.View.Text.V1.Model::AcceptanceVector)"
for r, a in reversed(vectors):
    vec = (f"(cons (record Foundation.View.Text.V1.Model::AcceptanceVector {{request := {h(r)}, "
           f"response := {h(a)}}}) {vec})")

(out / f"src/{APPM}.lex.tex").write_text(rf"""\begin{{lexlean}}{{{APPM}}}
\useglossary{{lexlean.std.bool@1.2.0}}
\useglossary{{lexlean.std.nat@1.2.0}}
\useglossary{{prism.arch@1.0.0}}
\importmodule{{Foundation.Bytes}}
\importmodule{{Foundation.View.Text.V1.Model}}
\importmodule{{{MOD}}}
\title{{Text application model}}
\begin{{semanticmodule}}
definition{{
  name: dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: ({MOD}::{P}Dispatch value),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: application,
  parameters: [],
  result: Foundation.View.Text.V1.Model::TextApplication,
  body: (record Foundation.View.Text.V1.Model::TextApplication {{profile := "prismpm/text-application/1", name := "prism-{P}", cargoName := "prism-{P}", cargoVersion := "0.1.0", cargoDescription := "{SPEC['title']}", cargoRepository := "https://github.com/afflom/me", cargoHomepage := "https://afflom.github.io/me/", libraryRoots := (cons "Me.{APPM}.dispatch" (nil String)), acceptanceVectors := {vec}, entryRoot := "Me.{APPM}.dispatch", coreContract := "hologram:guest/core-wasm@1", requestMaximum := ({REQ_MAX} : UInt32), responseMaximum := ({RESP_MAX} : UInt32), guestAllocationMaximum := ({ALLOC} : UInt32), capabilitiesEmpty := true, fatArchive := true, primaryLayer := (0 : UInt8), viewLayer := (1 : UInt8), view := (record Foundation.View.Text.V1.Model::TextView {{title := "prism-{P}", heading := "prism-{P}", inputLabel := "Request", submitLabel := "Decide", outputLabel := "Answer", inputError := "Invalid request", responseError := "Invalid response"}})}})
}}
\end{{semanticmodule}}
\end{{lexlean}}
""")
print(out)
