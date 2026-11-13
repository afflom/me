"""Writes app/src/Prism.lex.tex, the Prism's single application root.

The root routes a request "<facet> <rest>" to the facet module's
`dispatch rest`, and proves one `routes<Facet>` theorem per facet plus
`refusesUnknownFacet`. To add a facet: append (keyword, Module, dispatch name) to FACETS,
add vectors for it below, raise the limits if its requests or answers are
larger, then run

    python3 -I tools/prism_root.py app/src
    (cd app && lexlean fmt && lexlean lock)

and add the facet to PM-01 in crates/conformance/tests/prism.rs.
The theorems go to PrismProofs.lex.tex, apart from the root. They are proved
by reflexivity: the facet codes are literals, so `route` reduces by
definition, and `linear_arithmetic` cannot see through the Bytes equality.
Every definition and type name must be unique across app/src, because the
holo build flattens all modules into one Rust crate: prefix a facet's names
with the facet (boundaryJudge, BoundaryRequest).
The guest allocation must stay at least twice the request maximum, and one
vector must be exactly the allocation long (prismpm PP2009).
"""
import sys
FACETS = [
    ("boundary", "PrismBoundary", "boundaryDispatch"),
    ("learn", "PrismLearning", "learningDispatch"),
    ("when", "PrismChronology", "chronologyDispatch"),
    ("store", "PrismVaultStore", "storeDispatch"),
    ("restore", "PrismVaultRestore", "restoreDispatch"),
    ("r4", "PrismR4", "r4Dispatch"),
    ("route", "PrismRoute", "routeDispatch"),
    ("google", "PrismGoogle", "googleDispatch"),
    ("googlelink", "PrismGoogleLink", "googleLinkDispatch"),
    ("dest", "PrismDest", "destDispatch"),
    ("model", "PrismModels", "modelsDispatch"),
 ("resonance", "PrismResonance", "resonanceDispatch"),
]
REQ_MAX, RESP_MAX, ALLOC = 1107, 16384, 2214
h = lambda s: "0x" + (s if isinstance(s, bytes) else s.encode()).hex()
VECTORS = [
 ("boundary public none browser none no no", "allow"),
 ("boundary confidential none github owner no no", "deny"),
 ("boundary public none browser none no yes", "deny"),
 ("boundary confidential none outbound none no no", "ask"),
 ("boundary restricted none browser owner no no", "hashonly"),
 ("boundary public none browser none no", "invalid"),
 ("store allow present derived ok", "store"),
 ("store hashonly present derived ok", "storehash"),
 ("store allow present mismatch ok", "refuse"),
 ("restore present known valid derived value", "restore"),
 ("restore present known broken derived value", "refuse"),
 ("r4 inprism match match none allow", "answer"),
 ("r4 inprism match mismatch none allow", "refuse"),
 ("google gmail read readonly fresh none no", "fetch"),
 ("google gmail read readonly fresh none yes", "refuse"),
 ("google other read readonly fresh owner no", "refuse"),
 ("google gmail write readonly fresh none no", "ask"),
 ("google calendar read readonly expired none no", "consent"),
 ("googlelink unprovisioned provision operator matches no", "registered"),
 ("googlelink registered consent owner matches no", "granted"),
 ("googlelink registered consent prism matches no", "refuse"),
 ("googlelink granted sync prism differs no", "unprovisioned"),
 ("googlelink syncing sync prism matches yes", "revoked"),
 ("dest owner allow grounded none seen calm quiet normal no", "hold"),
 ("dest mail ask grounded none seen calm open normal no", "draft"),
 ("dest mail allow grounded owner seen calm open normal no", "deliver"),
 ("dest", "invalid request"),
 ("model locked onnx match match granted no", "run"),
 ("model locked onnx missing match granted no", "fetch"),
 ("model locked onnx match match ungranted no", "ask"),
 ("model locked onnx match match granted yes", "refuse"),
 ("model unlocked gguf match match granted no", "refuse"),
 ("model", "invalid request"),
 ("resonance dwell calm near day consolidated open no", "chorus"),
 ("resonance open calm near night inferred open no", "whisper"),
 ("resonance dismiss calm near day confirmed open no", "recede"),
 ("resonance dwell calm near day confirmed open yes", "rest"),
 ("resonance dwell calm near day confirmed open", "invalid"),
 ("resonance", "invalid request"),
 ("google", "invalid request"),
 ("learn", "invalid request"),
 ("when", "invalid request"),
 ("boundary", "invalid request"),
 ("", "invalid request"),
 ("hello world", "invalid request"),
 ("Boundary public none browser none no no", "invalid request"),
 ("route", "invalid request"),
 ("x" * REQ_MAX, "invalid request"),
 ("x" * (REQ_MAX + 1), "invalid request"),
 ("x" * ALLOC, "invalid request"),
]
# The route facet's own vectors live beside it, in PrismRoute.lex.tex
# (routeVectors); the root replays each with the facet keyword in front.
import os as _os, re as _re
_route = open(_os.path.join(sys.argv[1], "PrismRoute.lex.tex")).read()
_route = _route[_route.index("name: routeVectors"):]
VECTORS += [(b"route " + bytes.fromhex(q), bytes.fromhex(r))
            for q, r in _re.findall(r"request := 0x([0-9a-f]*), response := 0x([0-9a-f]*)", _route)]
out = []
w = out.append
w(r"""\begin{lexlean}{Prism}
\useglossary{lexlean.std.bool@1.2.0}
\useglossary{lexlean.std.nat@1.2.0}
\useglossary{prism.arch@1.0.0}
\importmodule{Foundation.Bytes}
\importmodule{Foundation.View.Text.V1.Model}
""")
for _, m, _ in FACETS:
    w("\\importmodule{%s}\n" % m)
w(r"""\title{Text application model}
\begin{semanticmodule}
""")
w("definition{name: facetUnknown, parameters: [], result: Nat, body: 0}\n\n")
for i, (k, _, _) in enumerate(FACETS, 1):
    w("definition{name: facet%s, parameters: [], result: Nat, body: %d}\n\n" % (k.capitalize(), i))
w("definition{name: refusal, parameters: [], result: Bytes, body: %s}\n\n" % h("invalid request"))
w("""definition{
  name: wordEnd,
  parameters: [s : Bytes, i : Nat, fuel : Nat],
  result: Nat,
  body: (match fuel
    | Nat.zero => i
    | Nat.succ rest => (match (prim index s i : (Option UInt8))
      | Option.none => i
      | Option.some b => (if ((prim to_nat b : Nat) =? 32) then i else (wordEnd s (i + 1) rest)))),
  axioms: [Quot.sound, propext],
  recursive_argument: fuel
}

definition{
  name: sliceOr,
  parameters: [s : Bytes, start : Nat, count : Nat],
  result: Bytes,
  body: (match (prim slice s start count : (Option Bytes))
    | Option.none => 0x
    | Option.some part => part)
}

definition{
  name: headEnd,
  parameters: [value : Bytes],
  result: Nat,
  body: (wordEnd value 0 (Foundation.Bytes::byteLength value)),
  axioms: [Quot.sound, propext]
}

""")
body = "(facetUnknown)"
for k, _, _ in reversed(FACETS):
    body = "(if (prim equal word %s : Bool) then (facet%s) else %s)" % (h(k), k.capitalize(), body)
w("""definition{
  name: parseFacet,
  parameters: [word : Bytes],
  result: Nat,
  body: %s
}

definition{
  name: facetOf,
  parameters: [value : Bytes],
  result: Nat,
  body: (parseFacet (sliceOr value 0 (headEnd value))),
  axioms: [Quot.sound, propext]
}

definition{
  name: restOf,
  parameters: [value : Bytes],
  result: Bytes,
  body: (if ((headEnd value) =? (Foundation.Bytes::byteLength value)) then 0x else (sliceOr value ((headEnd value) + 1) (prim subtract (Foundation.Bytes::byteLength value) ((headEnd value) + 1) : Nat))),
  axioms: [Quot.sound, propext]
}

""" % body)
body = "(refusal)"
for k, m, d in reversed(FACETS):
    body = "(if (facet =? (facet%s)) then (%s::%s rest) else %s)" % (k.capitalize(), m, d, body)
w("""definition{
  name: route,
  parameters: [facet : Nat, rest : Bytes],
  result: Bytes,
  body: %s,
  axioms: [Quot.sound, propext]
}

definition{
  name: dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: (if (%d <? (Foundation.Bytes::byteLength value)) then (refusal) else (if ((Foundation.Bytes::byteLength (restOf value)) =? 0) then (refusal) else (route (facetOf value) (restOf value)))),
  axioms: [Quot.sound, propext]
}

""" % (body, REQ_MAX))
proofs = []
for k, m, d in FACETS:
    proofs.append("""theorem{
  name: routes%s,
  parameters: [rest : Bytes],
  statement: ((route (facet%s) rest) = (%s::%s rest)),
  proof: reflexivity{},
  axioms: [Quot.sound, propext]
}

""" % (k.capitalize(), k.capitalize(), m, d))
proofs.append("""theorem{
  name: refusesUnknownFacet,
  parameters: [rest : Bytes],
  statement: ((route (facetUnknown) rest) = (refusal)),
  proof: reflexivity{},
  axioms: [Quot.sound, propext]
}

""")
vec = "(nil Foundation.View.Text.V1.Model::AcceptanceVector)"
for req, resp in reversed(VECTORS):
    vec = "(cons (record Foundation.View.Text.V1.Model::AcceptanceVector {request := %s, response := %s}) %s)" % (h(req), h(resp), vec)
w("""definition{
  name: application,
  parameters: [],
  result: Foundation.View.Text.V1.Model::TextApplication,
  body: (record Foundation.View.Text.V1.Model::TextApplication {profile := "prismpm/text-application/1", name := "me", cargoName := "prism-me", cargoVersion := "0.1.0", cargoDescription := "A Prism of its owner: routes each request to the facet that decides it.", cargoRepository := "https://github.com/afflom/me", cargoHomepage := "https://afflom.github.io/me/", libraryRoots := (cons "Me.Prism.dispatch" (nil String)), acceptanceVectors := %s, entryRoot := "Me.Prism.dispatch", coreContract := "hologram:guest/core-wasm@1", requestMaximum := (%d : UInt32), responseMaximum := (%d : UInt32), guestAllocationMaximum := (%d : UInt32), capabilitiesEmpty := true, fatArchive := true, primaryLayer := (0 : UInt8), viewLayer := (1 : UInt8), view := (record Foundation.View.Text.V1.Model::TextView {title := "me", heading := "me", inputLabel := "Request: facet, then its fields", submitLabel := "Ask", outputLabel := "Answer", inputError := "Invalid request", responseError := "Invalid response"})})
}
\\end{semanticmodule}
\\end{lexlean}
""" % (vec, REQ_MAX, RESP_MAX, ALLOC))
import os, re
open(os.path.join(sys.argv[1], "Prism.lex.tex"), "w").write("".join(out))
body = "".join(proofs)
body = re.sub(r"\((facet\w+|refusal)\)", r"(Prism::\1)", body).replace("(route ", "(Prism::route ")
head = "\\begin{lexlean}{PrismProofs}\n\\useglossary{lexlean.std.bool@1.2.0}\n\\useglossary{lexlean.std.nat@1.2.0}\n\\useglossary{prism.arch@1.0.0}\n\\importmodule{Foundation.Bytes}\n\\importmodule{Prism}\n"
head += "".join("\\importmodule{%s}\n" % m for m in sorted(m for _, m, _ in FACETS))
head += "\\title{Text application model}\n\\begin{semanticmodule}\n"
open(os.path.join(sys.argv[1], "PrismProofs.lex.tex"), "w").write(head + body.rstrip("\n") + "\n\\end{semanticmodule}\n\\end{lexlean}\n")
