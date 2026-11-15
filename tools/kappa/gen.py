"""Writes the kappa facet's reader (keyword "kappa") from app/specs/kappa/spec.json.

    python3 -I tools/kappa/gen.py [--check]

The decision itself, the five fields to an answer, is the builder's: the set
(app/prompts/set.json, tools/prompts/gen.py) writes app/src/PrismKappa.lex.tex
and PrismKappaProofs.lex.tex, with prismKappaJudge and the guarantees proved
over it. Run that first: this reads the builder's names from PrismKappa.

Outputs, all generated, never hand-edited:
  app/src/PrismKappaLabel.lex.tex   the reader: "<label> <digest>" is read into
                                    a PrismKappa::PrismKappaRequest, decided by
                                    PrismKappa::prismKappaJudge, and answered
                                    with the axis it names for admit/unverified
  site/kappa/table.mjs              the axes, reader and tree in JavaScript,
                                    for the adapter and the Node suite's
                                    cross-check against the compiled guest

The reader reads the label itself (colon, axis, digit count, lowercase hex),
as kappa-registry's Kappa::parse does; only the digest word comes from the
browser. `read` and `request` below are the same reader in Python: the
builder's examples are the spec's raw examples read by them
(tools/prompts/gen.py). Every name of the reader module carries the prefix
`kappaLabel`, because the holo flattens every module of app/src into one Rust
crate.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/kappa/spec.json").read_text())
P = "kappaLabel"
MOD = "PrismKappaLabel"
# The decision module the builder writes from the spec (prism-code's names()).
DMOD = "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]+", SPEC["name"]) if w)
DP = DMOD[:1].lower() + DMOD[1:]
REQ = f"{DMOD}::{DMOD}Request"
FIELDS = SPEC["fields"]
ANSWERS = SPEC["outcomes"]
AXES = SPEC["axes"]
NAMES = [f["name"] for f in FIELDS]
VALUES = {f["name"]: f["values"] for f in FIELDS}
# The longest well-formed request: the longest label and the longest digest word.
MAXLEN = max(len(a["wire"]) + 1 + 2 * a["digestBytes"] for a in AXES) + 1 + max(len(v) for v in VALUES["digest"])
NAMED = ("admit", "unverified")  # answers that name the axis they admit under
INVALID = "0x" + b"invalid".hex()

assert [a["id"] for a in AXES] + ["other"] == VALUES["axis"], "axis values are the axes and other"
assert [a["discriminant"] for a in AXES] == list(range(len(AXES))), "discriminants are the axes' order"


def cap(s):
    return s[0].upper() + s[1:]


def hexb(s):
    return "0x" + s.encode().hex()


def pascal(s):
    return "".join(cap(w) for w in re.split(r"[^A-Za-z0-9]+", s) if w)


def vdef(field, value):
    """The builder's constant of one value of one field, in the decision module."""
    return f"{DMOD}::{DP}{pascal(field)}{pascal(value)}"


def adef(answer):
    """The builder's constant of one answer, in the decision module."""
    return f"{DMOD}::{DP}Answer{pascal(answer)}"


def decision():
    """The builder's decision module, held to the names this reader uses: its
    request structure has the spec's fields in order, every value and answer
    is the constant of its place, and it has the judge of one request."""
    path = ROOT / f"app/src/{DMOD}.lex.tex"
    if not path.exists():
        sys.exit(f"kappa: {path.relative_to(ROOT)} is missing: run python3 -I tools/prompts/gen.py first")
    text = path.read_text()
    consts = {m.group(1): int(m.group(2)) for m in re.finditer(r"name: (\w+), parameters: \[\], result: Nat, body: (\d+)\}", text)}
    faults = []
    body = re.search(r"name: %sRequest,\s*type_parameters: \[\],\s*parameters: \[\],\s*fields: \[(.*?)\]\s*\}" % DMOD, text, re.S)
    if not body or re.findall(r"\{name: (\w+), type: Nat\}", body.group(1)) != NAMES:
        faults.append(f"{DMOD}Request does not have the fields {NAMES}")
    for f in FIELDS:
        for i, v in enumerate(f["values"]):
            if consts.get(vdef(f["name"], v).split("::")[1]) != i:
                faults.append(f"{vdef(f['name'], v)} is not value {i} of {f['name']}")
    for i, a in enumerate(ANSWERS):
        if consts.get(adef(a).split("::")[1]) != i:
            faults.append(f"{adef(a)} is not answer {i}")
    if f"name: {DP}Judge,\n  parameters: [request : {DMOD}Request]," not in text:
        faults.append(f"{DMOD} has no {DP}Judge of one request")
    if faults:
        sys.exit("kappa: the builder's decision is not the spec's: " + "; ".join(faults))


def read(label, digest):
    """The label's fields, read as the model reads them: on its UTF-8 bytes."""
    b = label.encode()
    c = b.find(b":")
    if c < 0:
        return {"colon": "absent", "axis": "other", "digits": "wrong", "hex": "bad", "digest": digest}
    axis = next((a for a in AXES if a["wire"].encode() == b[:c]), None)
    digits = b[c + 1:]
    return {
        "colon": "present",
        "axis": axis["id"] if axis else "other",
        "digits": "right" if axis and len(digits) == 2 * axis["digestBytes"] else "wrong",
        "hex": "lower" if all(48 <= d <= 57 or 97 <= d <= 102 for d in digits) else "bad",
        "digest": digest,
    }


def request(line):
    """The fields of one request line "<label> <digest>", or None when the
    reader refuses it (too long, no space, or a digest word it does not know)."""
    label, space, digest = line.partition(" ")
    if len(line.encode()) > MAXLEN or not space or digest not in VALUES["digest"]:
        return None
    return read(label, digest)


def judge(r, t=None):
    t = SPEC["tree"] if t is None else t
    if isinstance(t, str):
        return t
    f, v = t["if"]
    return judge(r, t["then"] if r[f] == v else t["else"])


def answer(line):
    """The answer the guest gives for one request line."""
    r = request(line)
    if r is None:
        return "invalid"
    a = judge(r)
    return a + words(next(x for x in AXES if x["id"] == r["axis"])) if a in NAMED else a


def words(axis):
    return f" {axis['wire']} {axis['discriminant']} {axis['digestBytes']}"


def js_tree(t, ind="  "):
    if isinstance(t, str):
        return f"'{t}'"
    f, v = t["if"]
    return f"(r.{f} === '{v}'\n{ind}? {js_tree(t['then'], ind + '  ')}\n{ind}: {js_tree(t['else'], ind + '  ')})"


def chain(pairs, last):
    """(if (axis =? A) then X else ...) over the axes, ending in `last`."""
    body = last
    for cond, value in reversed(pairs):
        body = f"(if {cond} then {value} else {body})"
    return body


def module():
    out = []
    w = out.append
    w(r"""\begin{lexlean}{PrismKappaLabel}
\useglossary{lexlean.std.bool@1.2.0}
\useglossary{lexlean.std.nat@1.2.0}
\useglossary{prism.arch@1.0.0}
\importmodule{Foundation.Bytes}
\importmodule{Foundation.View.Text.V1.Model}
\importmodule{PrismKappa}
\title{Text application model}
\begin{semanticmodule}
""")
    w(f"""definition{{
  name: {P}ByteAt,
  parameters: [s : Bytes, i : Nat],
  result: (Option Nat),
  body: (match (prim index s i : (Option UInt8))
    | Option.none => (ctor Option.none [Nat])
    | Option.some b => (ctor Option.some [Nat] (prim to_nat b : Nat))),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: {P}SliceOf,
  parameters: [s : Bytes, start : Nat, count : Nat],
  result: Bytes,
  body: (match (prim slice s start count : (Option Bytes))
    | Option.none => 0x
    | Option.some part => part)
}}

definition{{
  name: {P}StopAt,
  parameters: [s : Bytes, stop : Nat, i : Nat, fuel : Nat],
  result: Nat,
  body: (match fuel
    | Nat.zero => i
    | Nat.succ rest => (match ({P}ByteAt s i)
      | Option.none => i
      | Option.some d => (if (d =? stop) then i else ({P}StopAt s stop (i + 1) rest)))),
  axioms: [Quot.sound, propext],
  recursive_argument: fuel
}}

definition{{
  name: {P}AllHex,
  parameters: [s : Bytes, i : Nat, fuel : Nat],
  result: Bool,
  body: (match fuel
    | Nat.zero => true
    | Nat.succ rest => (match ({P}ByteAt s i)
      | Option.none => true
      | Option.some d => (if ((d <? 48) || (102 <? d)) then false else (if ((57 <? d) && (d <? 97)) then false else ({P}AllHex s (i + 1) rest))))),
  axioms: [Quot.sound, propext],
  recursive_argument: fuel
}}

""")
    axis_body = "(ctor Option.none [Nat])"
    for a in reversed(AXES):
        axis_body = f"(if (prim equal value {hexb(a['wire'])} : Bool) then (ctor Option.some [Nat] ({vdef('axis', a['id'])})) else {axis_body})"
    w(f"definition{{\n  name: {P}ParseAxis,\n  parameters: [value : Bytes],\n  result: (Option Nat),\n  body: {axis_body}\n}}\n\n")
    digest_body = "(ctor Option.none [Nat])"
    for v in reversed(VALUES["digest"]):
        digest_body = f"(if (prim equal value {hexb(v)} : Bool) then (ctor Option.some [Nat] ({vdef('digest', v)})) else {digest_body})"
    w(f"definition{{\n  name: {P}ParseDigest,\n  parameters: [value : Bytes],\n  result: (Option Nat),\n  body: {digest_body}\n}}\n\n")
    hexlen = chain([(f"(axis =? ({vdef('axis', a['id'])}))", str(2 * a["digestBytes"])) for a in AXES], "0")
    w(f"definition{{\n  name: {P}HexLength,\n  parameters: [axis : Nat],\n  result: Nat,\n  body: {hexlen}\n}}\n\n")
    named = chain([(f"(axis =? ({vdef('axis', a['id'])}))", hexb(words(a))) for a in AXES], "0x")
    w(f"definition{{\n  name: {P}AxisWords,\n  parameters: [axis : Nat],\n  result: Bytes,\n  body: {named}\n}}\n\n")
    absent = (f"(record {REQ} {{colon := ({vdef('colon', 'absent')}), axis := ({vdef('axis', 'other')}), "
              f"digits := ({vdef('digits', 'wrong')}), hex := ({vdef('hex', 'bad')}), digest := digest}})")
    present = (f"(record {REQ} {{colon := ({vdef('colon', 'present')}), axis := a, "
               f"digits := (if ((prim subtract n (c + 1) : Nat) =? ({P}HexLength a)) then ({vdef('digits', 'right')}) else ({vdef('digits', 'wrong')})), "
               f"hex := (if ({P}AllHex label (c + 1) n) then ({vdef('hex', 'lower')}) else ({vdef('hex', 'bad')})), digest := digest}})")
    w(f"""definition{{
  name: {P}AxisOf,
  parameters: [value : Bytes],
  result: Nat,
  body: (match ({P}ParseAxis value)
    | Option.none => ({vdef('axis', 'other')})
    | Option.some v => v)
}}

definition{{
  name: {P}ReadLabel,
  parameters: [label : Bytes, digest : Nat],
  result: {REQ},
  body: (let n : Nat := (Foundation.Bytes::byteLength label); (let c : Nat := ({P}StopAt label 58 0 n); (if (c =? n) then {absent} else (let a : Nat := ({P}AxisOf ({P}SliceOf label 0 c)); {present})))),
  axioms: [Quot.sound, propext]
}}

definition{{
  name: {P}Decode,
  parameters: [s : Bytes],
  result: (Option {REQ}),
  body: (let n : Nat := (Foundation.Bytes::byteLength s); (let e : Nat := ({P}StopAt s 32 0 n); (if (e <? n) then (match ({P}ParseDigest ({P}SliceOf s (e + 1) (prim subtract n (e + 1) : Nat)))
    | Option.none => (ctor Option.none [{REQ}])
    | Option.some d => (ctor Option.some [{REQ}] ({P}ReadLabel ({P}SliceOf s 0 e) d))) else (ctor Option.none [{REQ}])))),
  axioms: [Quot.sound, propext]
}}

""")
    enc = INVALID
    for a in reversed(ANSWERS):
        word = hexb(a)
        if a in NAMED:
            word = f"(Foundation.Bytes::appendBytes {word} ({P}AxisWords axis))"
        enc = f"(if (code =? ({adef(a)})) then {word} else {enc})"
    w(f"definition{{\n  name: {P}EncodeAnswer,\n  parameters: [code : Nat, axis : Nat],\n  result: Bytes,\n  body: {enc}\n}}\n\n")
    w(f"""definition{{
  name: {P}Dispatch,
  parameters: [value : Bytes],
  result: Bytes,
  body: (if ({MAXLEN} <? (Foundation.Bytes::byteLength value)) then {INVALID} else (match ({P}Decode value)
    | Option.none => {INVALID}
    | Option.some request => ({P}EncodeAnswer ({DMOD}::{DP}Judge request) (project request axis)))),
  axioms: [Quot.sound, propext]
}}
\\end{{semanticmodule}}
\\end{{lexlean}}
""")
    return "".join(out)


def table():
    g = json.dumps([{"id": f"INV-{i:03}", **x} for i, x in enumerate(SPEC["guarantees"], 1)], indent=2)
    axes = json.dumps(AXES, indent=2)
    return f"""// Generated by tools/kappa/gen.py from app/specs/kappa/spec.json. Do not edit.
// The same reader as PrismKappaLabel.lex.tex and the same tree as the builder's
// PrismKappa.lex.tex, for the adapter and the Node suite's cross-check against
// the compiled guest. The guest decides; this mirror only names the axes and
// explains.

export const AXES = {axes};
export const FIELDS = {json.dumps([[n, VALUES[n]] for n in NAMES])};
export const ANSWERS = {json.dumps(ANSWERS)};
export const NAMED = {json.dumps(list(NAMED))};
export const MAX_LINE = {MAXLEN};
export const GUARANTEES = {g};
export const EXAMPLES = {json.dumps(SPEC["examples"], indent=2)};

// The label's fields, read as the model reads them: on its UTF-8 bytes.
export function read(label, digest) {{
  const b = new TextEncoder().encode(label);
  const c = b.indexOf(58);
  if (c < 0) return {{ colon: 'absent', axis: 'other', digits: 'wrong', hex: 'bad', digest }};
  const wire = new TextDecoder().decode(b.subarray(0, c));
  const axis = AXES.find((a) => a.wire === wire);
  const hex = b.subarray(c + 1);
  return {{
    colon: 'present',
    axis: axis ? axis.id : 'other',
    digits: axis && hex.length === 2 * axis.digestBytes ? 'right' : 'wrong',
    hex: hex.every((d) => (d >= 48 && d <= 57) || (d >= 97 && d <= 102)) ? 'lower' : 'bad',
    digest,
  }};
}}

export function judge(r) {{
  return {js_tree(SPEC['tree'])};
}}

// The answer the guest gives for one request line.
export function answer(line) {{
  const space = line.indexOf(' ');
  const digest = space < 0 ? '' : line.slice(space + 1);
  if (new TextEncoder().encode(line).length > MAX_LINE || space < 0 || !FIELDS[4][1].includes(digest)) return 'invalid';
  const r = read(line.slice(0, space), digest);
  const a = judge(r);
  const axis = AXES.find((x) => x.id === r.axis);
  return NAMED.includes(a) ? `${{a}} ${{axis.wire}} ${{axis.discriminant}} ${{axis.digestBytes}}` : a;
}}
"""


def main():
    decision()
    wrong = [(q, r, answer(q)) for q, r in SPEC["examples"] if answer(q) != r]
    if wrong:
        sys.exit("kappa: the reader does not answer the spec's examples: " + "; ".join(f"{q!r} -> {a!r}, not {r!r}" for q, r, a in wrong))
    outs = {
        ROOT / f"app/src/{MOD}.lex.tex": module(),
        ROOT / "site/kappa/table.mjs": table(),
    }
    if "--check" in sys.argv:
        squash = lambda s: "".join(s.split())
        stale = [str(p.relative_to(ROOT)) for p, text in outs.items() if not p.exists() or squash(p.read_text()) != squash(text)]
        if stale:
            sys.exit("kappa: stale, run python3 -I tools/kappa/gen.py: " + ", ".join(stale))
        return
    for p, text in outs.items():
        p.parent.mkdir(exist_ok=True)
        p.write_text(text)
    print(f"kappa: {len(AXES)} axes, {len(ANSWERS)} answers, {len(SPEC['examples'])} examples read, max line {MAXLEN}; the decision is {DMOD}'s")


if __name__ == "__main__":
    main()
