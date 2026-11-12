"""Writes a scratch LexLean project that builds PrismDest as its own guest.

    python3 -I tools/dest/standalone.py DIR

DIR gets app/'s toolchain files, Foundation, PrismDest(+Proofs) and a
DestApp module whose application record routes every request straight to
PrismDest::destDispatch. In the locked SDK image, with no network:

    lexlean fmt && lexlean lock && lexlean verify && prismpm build

The core wasm it builds is site/dest/guest/dest.wasm, pinned by SHA-256 in
site/dest/guest.mjs. Its vectors are the spec's examples plus the limits.
"""
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "app"
SPEC = json.loads((APP / "specs/dest/spec.json").read_text())
REQ_MAX, RESP_MAX, ALLOC = 128, 16, 256

out = pathlib.Path(sys.argv[1])
if out.exists():
    shutil.rmtree(out)
(out / "src").mkdir(parents=True)
for name in ("lakefile.toml", "lean-toolchain", "lake-manifest.json", "prismpm.toml"):
    shutil.copy(APP / name, out / name)
shutil.copytree(APP / "language", out / "language")
shutil.copytree(APP / "src/Foundation", out / "src/Foundation")
for name in ("PrismDest.lex.tex", "PrismDestProofs.lex.tex"):
    shutil.copy(APP / "src" / name, out / "src" / name)

toml = (APP / "lexlean.toml").read_text()
start = toml.index("entrypoints = [")
end = toml.index("]\n", start) + 2
entries = sorted(["src/DestApp.lex.tex", "src/PrismDest.lex.tex", "src/PrismDestProofs.lex.tex"])
toml = toml[:start] + "entrypoints = [" + ", ".join(f'"{e}"' for e in entries) + "]\n" + toml[end:]
(out / "lexlean.toml").write_text(toml)

h = lambda s: "0x" + s.encode().hex()
vectors = [(r, a) for r, a in SPEC["examples"]]
vectors += [("", "invalid"), ("x" * (REQ_MAX + 1), "invalid"), ("x" * ALLOC, "invalid")]
vec = "(nil Foundation.View.Text.V1.Model::AcceptanceVector)"
for r, a in reversed(vectors):
    vec = (f"(cons (record Foundation.View.Text.V1.Model::AcceptanceVector {{request := {h(r)}, "
           f"response := {h(a)}}}) {vec})")

(out / "src/DestApp.lex.tex").write_text(rf"""\begin{{lexlean}}{{DestApp}}
\useglossary{{lexlean.std.bool@1.2.0}}
\useglossary{{lexlean.std.nat@1.2.0}}
\useglossary{{prism.arch@1.0.0}}
\importmodule{{Foundation.Bytes}}
\importmodule{{Foundation.View.Text.V1.Model}}
\importmodule{{PrismDest}}
\title{{Text application model}}
\begin{{semanticmodule}}
definition{{
  name: dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: (PrismDest::destDispatch value),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: application,
  parameters: [],
  result: Foundation.View.Text.V1.Model::TextApplication,
  body: (record Foundation.View.Text.V1.Model::TextApplication {{profile := "prismpm/text-application/1", name := "prism-dest", cargoName := "prism-dest", cargoVersion := "0.1.0", cargoDescription := "Decides where one thing the Prism holds may go next.", cargoRepository := "https://github.com/afflom/me", cargoHomepage := "https://afflom.github.io/me/", libraryRoots := (cons "Me.DestApp.dispatch" (nil String)), acceptanceVectors := {vec}, entryRoot := "Me.DestApp.dispatch", coreContract := "hologram:guest/core-wasm@1", requestMaximum := ({REQ_MAX} : UInt32), responseMaximum := ({RESP_MAX} : UInt32), guestAllocationMaximum := ({ALLOC} : UInt32), capabilitiesEmpty := true, fatArchive := true, primaryLayer := (0 : UInt8), viewLayer := (1 : UInt8), view := (record Foundation.View.Text.V1.Model::TextView {{title := "prism-dest", heading := "prism-dest", inputLabel := "Request", submitLabel := "Decide", outputLabel := "Answer", inputError := "Invalid request", responseError := "Invalid response"}})}})
}}
\end{{semanticmodule}}
\end{{lexlean}}
""")
print(out)
