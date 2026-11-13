"""Writes the Prism's surface from app/specs/surface/spec.json.

    python3 -I tools/surface/gen.py

Outputs, all generated, never hand-edited:
  app/src/PrismSurface.lex.tex        every place, act, setting and visible word
  app/src/PrismSurfaceProofs.lex.tex  the surface's guarantees, each by decide
  site/surface/surface.mjs            the same records in JavaScript, for the page
  site/card.html                      the places, the result, the question and history
  site/card.css (token block)         the look: every tone in both themes, the fonts

The surface is the design model made visible: a place is a row of
Foundation.Me.V1.Model's views, and the proofs hold the two together, so a
place cannot show other domains than its view, an owner view cannot go
unplaced, and a note cannot be kept below its domain's floor. The page is
the person's view alone: a place in the system view (ISO/IEC 42010) is
filed by the back end and never drawn, and a drawn place is never the
system's. The words are
names, never explanations: a word longer than four words or ending a
sentence is refused here, before anything is written.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "app/specs/surface/spec.json").read_text())
MOD = "PrismSurface"
DESIGN = "Foundation.Me.V1.Model"

ACTS = [a["key"] for a in SPEC["acts"]]
HOSTS = SPEC["hosts"]
SHOWS = SPEC["shows"]
GROUPS = [g["key"] for g in SPEC["groups"]]
DIRECTIONS = ["in", "out", "local"]
SOURCES = SPEC["sources"]
VIEWPOINTS = SPEC["viewpoints"]
SETTING_KINDS = ["switch", "detail"]
REVEALS = ["always", "until-done", "on-tap"]


def refuse(why):
    sys.exit(f"surface: {why}")


def is_name(text):
    """A visible word is a name: at most four words, no sentence."""
    return len(text.split()) <= 4 and len(text) <= 28 and not text.rstrip().endswith((".", "!", "?", ":")) and "\n" not in text


def words():
    out = []
    out += [("domain", d) for d in SPEC["domains"]]
    out += [("label", w) for w in SPEC["labels"]]
    out += [("role", w) for w in SPEC["roles"]]
    out += [("place", p["name"]) for p in SPEC["places"]]
    out += [("act", a["word"]) for a in SPEC["acts"] if a["word"]]
    out += [("group", g["name"]) for g in SPEC["groups"]]
    out += [("setting", s["name"]) for s in SPEC["settings"]]
    out += [("section", x["name"]) for x in SPEC["sections"]]
    out += [(k, w) for k, w in SPEC["words"].items()]
    return out


for where, text in words():
    if not text or not is_name(text):
        refuse(f"the {where} word {text!r} is not a name: at most four words and 28 characters, no sentence")

s = lambda text: json.dumps(text, ensure_ascii=False)


def nats(values):
    out = "(nil Nat)"
    for v in reversed(values):
        out = f"(cons {v} {out})"
    return out


def strings(values):
    out = "(nil String)"
    for v in reversed(values):
        out = f"(cons {s(v)} {out})"
    return out


def records(kind, rows):
    out = f"(nil {kind})"
    for r in reversed(rows):
        out = f"(cons {r} {out})"
    return out


def place_record(p):
    return (
        f"(record SurfacePlace {{view := {p['view']}, name := {s(p['name'])}, host := {HOSTS.index(p['host'])}, "
        f"viewpoint := {VIEWPOINTS.index(p['viewpoint'])}, role := {p['role']}, domains := {nats(p['domains'])}, kind := {SHOWS.index(p['show'])}, act := {ACTS.index(p['act'])}}})"
    )


def setting_record(x):
    return (
        f"(record SurfaceSetting {{name := {s(x['name'])}, viewpoint := {VIEWPOINTS.index(x['viewpoint'])}, kind := {SETTING_KINDS.index(x['kind'])}, group := {GROUPS.index(x['group'])}, "
        f"source := {SOURCES.index(x['source']) if x['source'] != 'none' else len(SOURCES)}}})"
    )


def group_record(g):
    return f"(record SurfaceGroup {{name := {s(g['name'])}, direction := {DIRECTIONS.index(g['direction'])}}})"


def word_record(k, w):
    return f"(record SurfaceWord {{key := {s(k)}, text := {s(w)}}})"


# The look: every tone is a colour in each theme and sets brand variables;
# a pair the spec names must read at its contrast, by WCAG 2.2.
LOOK = SPEC["look"]
THEMES = LOOK["themes"]
TONES = {t["key"]: t for t in LOOK["tones"]}
BRAND = (ROOT / "site/brand/hologram-warm.css").read_text()


def rgb(hexcode):
    if len(hexcode) != 7 or hexcode[0] != "#":
        refuse(f"the colour {hexcode!r} is not #rrggbb")
    return tuple(int(hexcode[i:i + 2], 16) for i in (1, 3, 5))


def luminance(hexcode):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb(hexcode))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fore, back):
    a, b = sorted((luminance(fore), luminance(back)), reverse=True)
    return (a + 0.05) / (b + 0.05)


claimed = {}
for tone in LOOK["tones"]:
    for theme in THEMES:
        rgb(tone[theme])
    for var in tone["sets"]:
        if f"--{var}:" not in BRAND:
            refuse(f"the tone {tone['key']} sets --{var}, which the brand does not define")
        if var in claimed:
            refuse(f"--{var} is set by both {claimed[var]} and {tone['key']}")
        claimed[var] = tone["key"]
CONTRASTS = []
for fore, back, floor in LOOK["contrast"]:
    for theme in THEMES:
        ratio = contrast(TONES[fore][theme], TONES[back][theme])
        if ratio < floor:
            refuse(f"{fore} on {back} reads at {ratio:.2f} in {theme}, under its {floor}")
        CONTRASTS.append((fore, back, theme, int(ratio * 100), int(floor * 100)))
TONE_KEYS = list(TONES)


def tone_record(t):
    return f"(record SurfaceTone {{name := {s(t['key'])}, dark := {int(t['dark'][1:], 16)}, light := {int(t['light'][1:], 16)}}})"


def contrast_record(c):
    fore, back, theme, ratio, floor = c
    return (f"(record SurfaceContrast {{fore := {TONE_KEYS.index(fore)}, back := {TONE_KEYS.index(back)}, "
            f"theme := {THEMES.index(theme)}, ratio := {ratio}, floor := {floor}}})")


# The feeders: the facet behind every place. A source setting fills the
# domains it reads into; an act fills the domain its place keeps into. A list
# place that no feeder can fill is refused here and disproved in the proofs.
SETTING_KEYS = [x["key"] for x in SPEC["settings"]]

# The panel: every person setting in exactly one section, in the order a person
# needs them; each section serves journeys or lasting goals the product record
# names, so nothing is in the panel that no success of the person's asks for.
PRODUCT = json.loads((ROOT / "app/specs/product/spec.json").read_text())
SUCCESS = {j["key"] for j in PRODUCT["journeys"]} | {a["key"] for a in PRODUCT["always"]}
for x in SPEC["sections"]:
    if x["reveal"] not in REVEALS:
        refuse(f"the section {x['key']} reveals {x['reveal']!r}, not one of {REVEALS}")
    for k in x["settings"]:
        if k not in SETTING_KEYS:
            refuse(f"the section {x['key']} holds {k!r}, which is not a setting")
    if x.get("rows") not in (None, "services") or (x.get("rows") and not (ROOT / "app/specs/source/services.json").exists()):
        refuse(f"the section {x['key']} draws rows from {x.get('rows')!r}, which is not a declaration the Prism has")
    for k in x["serves"]:
        if k not in SUCCESS:
            refuse(f"the section {x['key']} serves {k!r}, which is neither a journey nor a lasting goal of the product record")


def section_record(x):
    return (f"(record SurfaceSection {{name := {s(x['name'])}, settings := {nats([SETTING_KEYS.index(k) for k in x['settings']])}, "
            f"reveal := {REVEALS.index(x['reveal'])}, serves := {len(x['serves'])}}})")

# Set up: the sections a person meets first, in order, one at a time. Every
# section that shows its detail until done is a step; a step names its section
# once, and an empty place offers the step that fills it.
SECTION_KEYS = [x["key"] for x in SPEC["sections"]]
SETUP = SPEC.get("setup", [])
if not 1 <= len(SETUP) <= 3:
    refuse(f"set up has {len(SETUP)} steps; a person meets one to three")
for st in SETUP:
    if st["section"] not in SECTION_KEYS or st["word"] not in SPEC["words"]:
        refuse(f"the setup step {st['key']} names an unknown section or word")
if len({st["section"] for st in SETUP}) != len(SETUP):
    refuse("a section is a setup step at most once")
for x in SPEC["sections"]:
    if x["reveal"] == "until-done" and x["key"] not in {st["section"] for st in SETUP}:
        refuse(f"the section {x['key']} shows its detail until done but is not a setup step")
for p_ in SPEC["places"]:
    if "fills" in p_ and p_["fills"] not in {st["key"] for st in SETUP}:
        refuse(f"the place {p_['key']} is filled by {p_['fills']!r}, which is not a setup step")


FEEDERS = []
for f in SPEC["feeders"]:
    if f["act"] != "none":
        if f["act"] not in ACTS:
            refuse(f"the feeder {f['key']} names an unknown act")
        domains = sorted({p["domains"][0] for p in SPEC["places"] if p["act"] == f["act"]})
        word = next(a["word"] for a in SPEC["acts"] if a["key"] == f["act"])
    else:
        if f["setting"] not in SETTING_KEYS or f["word"] not in SPEC["words"]:
            refuse(f"the feeder {f['key']} names an unknown setting or word")
        domains = f["domains"]
        word = SPEC["words"][f["word"]]
    FEEDERS.append({"key": f["key"], "act": f["act"], "setting": f["setting"], "word": word, "domains": domains})
fed = {d for f in FEEDERS for d in f["domains"]}
for p_ in SPEC["places"]:
    if p_["show"] == "list" and not fed & set(p_["domains"]):
        refuse(f"the place {p_['key']} has no feeder for any of its domains")


def feeder_record(f):
    setting = SETTING_KEYS.index(f["setting"]) if f["setting"] != "none" else len(SETTING_KEYS)
    return f"(record SurfaceFeeder {{name := {s(f['key'])}, act := {ACTS.index(f['act'])}, setting := {setting}, domains := {nats(f['domains'])}}})"
# The voice: tones in 5-limit just intonation. A numerator or denominator is
# written into the model as its prime factors, so the proof that the scale is
# just is a proof about the ratios themselves, not about this script.
VOICE = SPEC["voice"]
ANSWERS = [a["key"] for a in VOICE["answers"]]


def five_limit(n):
    factors = []
    for prime in (2, 3, 5):
        while n % prime == 0:
            factors.append(prime)
            n //= prime
    if n != 1:
        refuse(f"the voice's ratio part has a prime above 5")
    return factors


def factors(n):
    return nats(five_limit(n))


for num, den in VOICE["scale"] + [p_[:2] for p_ in VOICE["partials"]]:
    five_limit(num), five_limit(den)
for a in VOICE["answers"]:
    if a["tone"] not in TONES:
        refuse(f"the answer {a['key']} sounds in {a['tone']}, which is not a tone of the look")
    if any(d >= len(VOICE["scale"]) for d in a["degrees"]):
        refuse(f"the answer {a['key']} names a degree outside the scale")
for word, answer in VOICE["outcomes"].items():
    if word not in SPEC["words"] or answer not in ANSWERS:
        refuse(f"the outcome {word} -> {answer} names an unknown word or answer")


def ratio_record(r):
    return f"(record SurfaceRatio {{num := {factors(r[0])}, den := {factors(r[1])}}})"


def answer_record(a):
    return f"(record SurfaceAnswer {{name := {s(a['key'])}, degrees := {nats(a['degrees'])}, level := {a['level']}, tone := {TONE_KEYS.index(a['tone'])}}})"


def defn(name, result, body, params="[]"):
    return f"definition{{\n  name: {name},\n  parameters: {params},\n  result: {result},\n  body: {body}\n}}\n"


def rec(name, params, result, body, arg):
    return f"definition{{\n  name: {name},\n  parameters: {params},\n  result: {result},\n  body: {body},\n  recursive_argument: {arg}\n}}\n"


outbound = [i for i, a in enumerate(SPEC["acts"]) if a["target"] in ("mail", "calendar", "platform")]
note = ACTS.index("note")
ask = ACTS.index("ask")
composer = HOSTS.index("composer")
home = HOSTS.index("home")
nav = HOSTS.index("nav")
sheet = HOSTS.index("sheet")
undrawn = HOSTS.index("none")
system = VIEWPOINTS.index("system")
routed = [SOURCES.index(x) for x in SPEC["routed"] if x != "ownerUtterance"]

model = [
    "\\begin{lexlean}{PrismSurface}",
    "\\useglossary{lexlean.std.bool@1.2.0}",
    "\\useglossary{lexlean.std.nat@1.2.0}",
    "\\useglossary{prism.arch@1.0.0}",
    "\\title{Prism surface}",
    "\\begin{semanticmodule}",
    """structure{
  name: SurfacePlace,
  type_parameters: [],
  parameters: [],
  fields: [
    {name: view, type: Nat},
    {name: name, type: String},
    {name: host, type: Nat},
    {name: viewpoint, type: Nat},
    {name: role, type: Nat},
    {name: domains, type: (List Nat)},
    {name: kind, type: Nat},
    {name: act, type: Nat}
  ]
}
""",
    """structure{
  name: SurfaceGroup,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: direction, type: Nat}]
}
""",
    """structure{
  name: SurfaceSetting,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: viewpoint, type: Nat}, {name: kind, type: Nat}, {name: group, type: Nat}, {name: source, type: Nat}]
}
""",
    """structure{
  name: SurfaceSection,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: settings, type: (List Nat)}, {name: reveal, type: Nat}, {name: serves, type: Nat}]
}
""",
    """structure{
  name: SurfaceWord,
  type_parameters: [],
  parameters: [],
  fields: [{name: key, type: String}, {name: text, type: String}]
}
""",
    """structure{
  name: SurfaceTone,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: dark, type: Nat}, {name: light, type: Nat}]
}
""",
    """structure{
  name: SurfaceContrast,
  type_parameters: [],
  parameters: [],
  fields: [{name: fore, type: Nat}, {name: back, type: Nat}, {name: theme, type: Nat}, {name: ratio, type: Nat}, {name: floor, type: Nat}]
}
""",
    """structure{
  name: SurfaceFeeder,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: act, type: Nat}, {name: setting, type: Nat}, {name: domains, type: (List Nat)}]
}
""",
    """structure{
  name: SurfaceRatio,
  type_parameters: [],
  parameters: [],
  fields: [{name: num, type: (List Nat)}, {name: den, type: (List Nat)}]
}
""",
    """structure{
  name: SurfaceAnswer,
  type_parameters: [],
  parameters: [],
  fields: [{name: name, type: String}, {name: degrees, type: (List Nat)}, {name: level, type: Nat}, {name: tone, type: Nat}]
}
""",
    defn("surfaceDomainNames", "(List String)", strings(SPEC["domains"])),
    defn("surfaceLabelNames", "(List String)", strings(SPEC["labels"])),
    defn("surfaceRoleNames", "(List String)", strings(SPEC["roles"])),
    defn("surfaceActWords", "(List String)", strings([a["word"] for a in SPEC["acts"]])),
    defn("surfaceFloors", "(List Nat)", nats(SPEC["floors"])),
    defn("surfacePlaces", "(List SurfacePlace)", records("SurfacePlace", [place_record(p) for p in SPEC["places"]])),
    defn("surfaceGroups", "(List SurfaceGroup)", records("SurfaceGroup", [group_record(g) for g in SPEC["groups"]])),
    defn("surfaceSettings", "(List SurfaceSetting)", records("SurfaceSetting", [setting_record(x) for x in SPEC["settings"]])),
    defn("surfaceSections", "(List SurfaceSection)", records("SurfaceSection", [section_record(x) for x in SPEC["sections"]])),
    defn("surfaceSetup", "(List Nat)", nats([SECTION_KEYS.index(st["section"]) for st in SETUP])),
    defn("surfaceWords", "(List SurfaceWord)", records("SurfaceWord", [word_record(k, w) for k, w in SPEC["words"].items()])),
    defn("surfaceRoutedSources", "(List Nat)", nats(routed)),
    defn("surfaceOutboundActs", "(List Nat)", nats(outbound)),
    defn("surfaceGroupCount", "Nat", str(len(GROUPS))),
    defn("surfaceTones", "(List SurfaceTone)", records("SurfaceTone", [tone_record(x) for x in LOOK["tones"]])),
    defn("surfaceContrasts", "(List SurfaceContrast)", records("SurfaceContrast", [contrast_record(x) for x in CONTRASTS])),
    defn("surfaceThemeCount", "Nat", str(len(THEMES))),
    defn("surfaceFeeders", "(List SurfaceFeeder)", records("SurfaceFeeder", [feeder_record(f) for f in FEEDERS])),
    defn("surfaceToneCount", "Nat", str(len(TONE_KEYS))),
    defn("surfaceScale", "(List SurfaceRatio)", records("SurfaceRatio", [ratio_record(r) for r in VOICE["scale"]])),
    defn("surfacePartials", "(List SurfaceRatio)", records("SurfaceRatio", [ratio_record(r) for r in VOICE["partials"]])),
    defn("surfaceAnswers", "(List SurfaceAnswer)", records("SurfaceAnswer", [answer_record(a) for a in VOICE["answers"]])),
    defn("surfaceVoiceCeiling", "Nat", str(VOICE["ceiling"])),
    defn("surfaceVoiceAttack", "Nat", str(VOICE["attack"])),
    defn("surfaceVoiceRelease", "Nat", str(VOICE["release"])),
    defn("surfaceVoiceRefractory", "Nat", str(VOICE["refractory"])),
    "\\end{semanticmodule}",
    "\\end{lexlean}",
    "",
]

M = f"{MOD}::"
D = f"{DESIGN}::"
proofs_defs = [
    rec("surfaceStringCount", "[values : (List String)]", "Nat",
        "(match values\n    | List.nil => 0\n    | List.cons value rest => ((surfaceStringCount rest) + 1))", "values"),
    rec("surfaceMember", "[wanted : Nat, values : (List Nat)]", "Bool",
        "(match values\n    | List.nil => false\n    | List.cons value rest => ((value =? wanted) || (surfaceMember wanted rest)))", "values"),
    rec("surfaceSameNats", "[left : (List Nat), right : (List Nat)]", "Bool",
        "(match left\n    | List.nil => (match right\n      | List.nil => true\n      | List.cons other more => false)\n"
        "    | List.cons value rest => (match right\n      | List.nil => false\n      | List.cons other more => ((value =? other) && (surfaceSameNats rest more))))", "left"),
    rec("surfaceViewCount", f"[view : Nat, places : (List {M}SurfacePlace)]", "Nat",
        "(match places\n    | List.nil => 0\n    | List.cons place rest => (if ((project place view) =? view) then ((surfaceViewCount view rest) + 1) else (surfaceViewCount view rest)))", "places"),
    rec("surfaceHostCount", f"[host : Nat, places : (List {M}SurfacePlace)]", "Nat",
        "(match places\n    | List.nil => 0\n    | List.cons place rest => (if ((project place host) =? host) then ((surfaceHostCount host rest) + 1) else (surfaceHostCount host rest)))", "places"),
    # Every owner view has exactly one place; no other audience's view has one.
    rec("surfaceOwnerViewsPlaced", f"[rows : (List {D}DesignView)]", "Bool",
        f"(match rows\n    | List.nil => true\n    | List.cons row rest => ((if ((project row audience) =? 0) then ((surfaceViewCount (project row index) ({M}surfacePlaces)) =? 1) else ((surfaceViewCount (project row index) ({M}surfacePlaces)) =? 0)) && (surfaceOwnerViewsPlaced rest)))", "rows"),
    rec("surfaceRowAgrees", f"[place : {M}SurfacePlace, rows : (List {D}DesignView)]", "Bool",
        "(match rows\n    | List.nil => false\n    | List.cons row rest => (if ((project row index) =? (project place view)) then (((project row role) =? (project place role)) && (surfaceSameNats (project row domains) (project place domains))) else (surfaceRowAgrees place rest)))", "rows"),
    # A place shows exactly its view's domains under its view's role.
    rec("surfacePlacesAgree", f"[places : (List {M}SurfacePlace)]", "Bool",
        f"(match places\n    | List.nil => true\n    | List.cons place rest => ((surfaceRowAgrees place ({D}designViews)) && (surfacePlacesAgree rest)))", "places"),
    # The page is the person's view: a place is undrawn exactly when it is the system's.
    rec("surfacePageIsPersonView", f"[places : (List {M}SurfacePlace)]", "Bool",
        f"(match places\n    | List.nil => true\n    | List.cons place rest => ((if ((project place viewpoint) =? {system}) then ((project place host) =? {undrawn}) else (not ((project place host) =? {undrawn}))) && (surfacePageIsPersonView rest)))", "places"),
    rec("surfaceActsSound", f"[places : (List {M}SurfacePlace)]", "Bool",
        f"(match places\n    | List.nil => true\n    | List.cons place rest => (((not (surfaceMember (project place act) ({M}surfaceOutboundActs))) || ((((project place role) =? 1) || ((project place role) =? 2)) || ((project place role) =? 4))) && ((if ((project place act) =? {ask}) then ((project place host) =? {composer}) else (not ((project place host) =? {composer}))) && (surfaceActsSound rest))))", "places"),
    defn("surfaceFirstOr", "Nat",
        "(match values\n    | List.nil => fallback\n    | List.cons value rest => value)", "[fallback : Nat, values : (List Nat)]"),
    # A note is kept at its place's first domain's floor, never public.
    rec("surfaceNotesNeverPublic", f"[places : (List {M}SurfacePlace)]", "Bool",
        f"(match places\n    | List.nil => true\n    | List.cons place rest => (((not ((project place act) =? {note})) || (1 <=? ({D}designFloorOf (surfaceFirstOr 0 (project place domains))))) && (surfaceNotesNeverPublic rest)))", "places"),
    rec("surfaceSourceCount", f"[source : Nat, settings : (List {M}SurfaceSetting)]", "Nat",
        "(match settings\n    | List.nil => 0\n    | List.cons setting rest => (if ((project setting source) =? source) then ((surfaceSourceCount source rest) + 1) else (surfaceSourceCount source rest)))", "settings"),
    rec("surfaceSourcesSet", "[sources : (List Nat)]", "Bool",
        f"(match sources\n    | List.nil => true\n    | List.cons source rest => (((surfaceSourceCount source ({M}surfaceSettings)) =? 1) && (surfaceSourcesSet rest)))", "sources"),
    rec("surfaceGroupUsed", f"[group : Nat, settings : (List {M}SurfaceSetting)]", "Bool",
        "(match settings\n    | List.nil => false\n    | List.cons setting rest => (((project setting group) =? group) || (surfaceGroupUsed group rest)))", "settings"),
    rec("surfaceSettingsGrouped", f"[settings : (List {M}SurfaceSetting)]", "Bool",
        f"(match settings\n    | List.nil => true\n    | List.cons setting rest => (((project setting group) <? ({M}surfaceGroupCount)) && (surfaceSettingsGrouped rest)))", "settings"),
]
proofs_defs += [
    # Every pair the look names reads at its floor, in every theme.
    rec("surfacePairsRead", f"[pairs : (List {M}SurfaceContrast)]", "Bool",
        f"(match pairs\n    | List.nil => true\n    | List.cons pair rest => (((project pair floor) <=? (project pair ratio)) && (((project pair theme) <? ({M}surfaceThemeCount)) && (surfacePairsRead rest))))", "pairs"),
    rec("surfaceColoursInRange", f"[tones : (List {M}SurfaceTone)]", "Bool",
        "(match tones\n    | List.nil => true\n    | List.cons tone rest => (((project tone dark) <? 16777216) && (((project tone light) <? 16777216) && (surfaceColoursInRange rest))))", "tones"),
    rec("surfaceThemesDiffer", f"[tones : (List {M}SurfaceTone)]", "Bool",
        "(match tones\n    | List.nil => false\n    | List.cons tone rest => ((not ((project tone dark) =? (project tone light))) || (surfaceThemesDiffer rest)))", "tones"),
]
proofs_defs += [
    rec("surfaceDomainFed", f"[domain : Nat, feeders : (List {M}SurfaceFeeder)]", "Bool",
        "(match feeders\n    | List.nil => false\n    | List.cons f rest => ((surfaceMember domain (project f domains)) || (surfaceDomainFed domain rest)))", "feeders"),
    rec("surfaceAnyFed", "[domains : (List Nat)]", "Bool",
        f"(match domains\n    | List.nil => false\n    | List.cons d rest => ((surfaceDomainFed d ({M}surfaceFeeders)) || (surfaceAnyFed rest)))", "domains"),
    # Every list place has a facet behind it: some feeder fills one of its domains.
    rec("surfacePlacesFed", f"[places : (List {M}SurfacePlace)]", "Bool",
        "(match places\n    | List.nil => true\n    | List.cons place rest => (((not ((project place kind) =? 0)) || (surfaceAnyFed (project place domains))) && (surfacePlacesFed rest)))", "places"),
    rec("surfaceTimes", "[a : Nat, b : Nat]", "Nat",
        "(match b\n    | Nat.zero => 0\n    | Nat.succ k => (a + (surfaceTimes a k)))", "b"),
    rec("surfaceProduct", "[factors : (List Nat)]", "Nat",
        "(match factors\n    | List.nil => 1\n    | List.cons f rest => (surfaceTimes f (surfaceProduct rest)))", "factors"),
    # Just: every prime in every ratio is 2, 3 or 5.
    rec("surfaceFactorsFiveLimit", "[factors : (List Nat)]", "Bool",
        "(match factors\n    | List.nil => true\n    | List.cons f rest => ((((f =? 2) || (f =? 3)) || (f =? 5)) && (surfaceFactorsFiveLimit rest)))", "factors"),
    rec("surfaceRatiosJust", f"[ratios : (List {M}SurfaceRatio)]", "Bool",
        "(match ratios\n    | List.nil => true\n    | List.cons r rest => ((surfaceFactorsFiveLimit (project r num)) && ((surfaceFactorsFiveLimit (project r den)) && (surfaceRatiosJust rest))))", "ratios"),
    # Within one octave over the base, rising step by step.
    rec("surfaceInOctave", f"[ratios : (List {M}SurfaceRatio)]", "Bool",
        "(match ratios\n    | List.nil => true\n    | List.cons r rest => ((((surfaceProduct (project r den)) <=? (surfaceProduct (project r num))) && ((surfaceProduct (project r num)) <=? ((surfaceProduct (project r den)) + (surfaceProduct (project r den))))) && (surfaceInOctave rest)))", "ratios"),
    rec("surfaceRising", f"[pn : Nat, pd : Nat, ratios : (List {M}SurfaceRatio)]", "Bool",
        "(match ratios\n    | List.nil => true\n    | List.cons r rest => (((surfaceTimes pn (surfaceProduct (project r den))) <? (surfaceTimes (surfaceProduct (project r num)) pd)) && (surfaceRising (surfaceProduct (project r num)) (surfaceProduct (project r den)) rest)))", "ratios"),
    rec("surfaceDegreesIn", "[bound : Nat, degrees : (List Nat)]", "Bool",
        "(match degrees\n    | List.nil => true\n    | List.cons d rest => ((d <? bound) && (surfaceDegreesIn bound rest)))", "degrees"),
    rec("surfaceRatioCount", f"[ratios : (List {M}SurfaceRatio)]", "Nat",
        "(match ratios\n    | List.nil => 0\n    | List.cons r rest => ((surfaceRatioCount rest) + 1))", "ratios"),
    rec("surfaceNatCount", "[values : (List Nat)]", "Nat",
        "(match values\n    | List.nil => 0\n    | List.cons v rest => ((surfaceNatCount rest) + 1))", "values"),
    # Every answer sounds degrees of the scale, at most a triad, at most full level, in a tone of the look.
    rec("surfaceAnswersSound", f"[answers : (List {M}SurfaceAnswer)]", "Bool",
        f"(match answers\n    | List.nil => true\n    | List.cons a rest => ((surfaceDegreesIn (surfaceRatioCount ({M}surfaceScale)) (project a degrees)) && (((surfaceNatCount (project a degrees)) <=? 3) && (((project a level) <=? 100) && (((project a tone) <? ({M}surfaceToneCount)) && (surfaceAnswersSound rest))))))", "answers"),
    # A rest is silent.
    rec("surfaceRestSilent", f"[answers : (List {M}SurfaceAnswer)]", "Bool",
        "(match answers\n    | List.nil => false\n    | List.cons a rest => ((((project a level) =? 0) && ((surfaceNatCount (project a degrees)) =? 0)) || (surfaceRestSilent rest)))", "answers"),
]
proofs_defs += [
    rec("surfaceSectionsHolding", f"[setting : Nat, sections : (List {M}SurfaceSection)]", "Nat",
        "(match sections\n    | List.nil => 0\n    | List.cons section rest => (if (surfaceMember setting (project section settings)) then ((surfaceSectionsHolding setting rest) + 1) else (surfaceSectionsHolding setting rest)))", "sections"),
    # A person's setting is in exactly one section; the system's in none.
    rec("surfaceSettingsSectioned", f"[index : Nat, settings : (List {M}SurfaceSetting)]", "Bool",
        f"(match settings\n    | List.nil => true\n    | List.cons setting rest => (((surfaceSectionsHolding index ({M}surfaceSections)) =? (if ((project setting viewpoint) =? {system}) then 0 else 1)) && (surfaceSettingsSectioned (index + 1) rest)))", "settings"),
    # A section holds one to three settings and serves at least one success of the person's.
    rec("surfaceSectionsShort", f"[sections : (List {M}SurfaceSection)]", "Bool",
        "(match sections\n    | List.nil => true\n    | List.cons section rest => (((1 <=? (surfaceNatCount (project section settings))) && (((surfaceNatCount (project section settings)) <=? 3) && (1 <=? (project section serves)))) && (surfaceSectionsShort rest)))", "sections"),
    rec("surfaceSetupCovers", f"[index : Nat, sections : (List {M}SurfaceSection)]", "Bool",
        f"(match sections\n    | List.nil => true\n    | List.cons section rest => ((if ((project section reveal) =? 1) then (surfaceMember index ({M}surfaceSetup)) else true) && (surfaceSetupCovers (index + 1) rest)))", "sections"),
    rec("surfaceSectionCount", f"[sections : (List {M}SurfaceSection)]", "Nat",
        "(match sections\n    | List.nil => 0\n    | List.cons section rest => ((surfaceSectionCount rest) + 1))", "sections"),
]
groups_all = "true"
for i in reversed(range(len(GROUPS))):
    groups_all = f"((surfaceGroupUsed {i} ({M}surfaceSettings)) && {groups_all})"
proofs_defs.append(defn("surfaceGroupsUsed", "Bool", groups_all))


def theorem(name, statement):
    return f"theorem{{\n  name: {name},\n  parameters: [],\n  statement: {statement},\n  proof: decide{{}}\n}}\n"


theorems = [
    theorem("surfaceEveryOwnerViewPlaced", f"((surfaceOwnerViewsPlaced ({D}designViews)) = true)"),
    theorem("surfacePlacesAreViews", f"((surfacePlacesAgree ({M}surfacePlaces)) = true)"),
    theorem("surfaceOneHome", f"((surfaceHostCount {home} ({M}surfacePlaces)) = 1)"),
    theorem("surfaceOneComposer", f"((surfaceHostCount {composer} ({M}surfacePlaces)) = 1)"),
    theorem("surfaceOneSheet", f"((surfaceHostCount {sheet} ({M}surfacePlaces)) = 1)"),
    theorem("surfaceEverySettingInOneSection", f"((surfaceSettingsSectioned 0 ({M}surfaceSettings)) = true)"),
    theorem("surfaceSectionsAreFewAndShort", f"(((surfaceSectionsShort ({M}surfaceSections)) && ((surfaceSectionCount ({M}surfaceSections)) <=? 4)) = true)"),
    theorem("surfaceSetupIsShortAndWhole", f"(((surfaceSetupCovers 0 ({M}surfaceSections)) && ((1 <=? (surfaceNatCount ({M}surfaceSetup))) && ((surfaceNatCount ({M}surfaceSetup)) <=? 3))) = true)"),
    theorem("surfacePageIsThePersonsView", f"((surfacePageIsPersonView ({M}surfacePlaces)) = true)"),
    theorem("surfaceMenuIsShort", f"(((surfaceHostCount {nav} ({M}surfacePlaces)) <=? 4) = true)"),
    theorem("surfaceActsInTheirRoles", f"((surfaceActsSound ({M}surfacePlaces)) = true)"),
    theorem("surfaceNotesKeepTheFloor", f"((surfaceNotesNeverPublic ({M}surfacePlaces)) = true)"),
    theorem("surfaceFloorsAreTheDesign", f"((surfaceSameNats ({M}surfaceFloors) ({D}designDomainFloors)) = true)"),
    theorem("surfaceEveryDomainNamed", f"((surfaceStringCount ({M}surfaceDomainNames)) = ({D}designDomainCount))"),
    theorem("surfaceEveryRoleNamed", f"((surfaceStringCount ({M}surfaceRoleNames)) = ({D}designRoleCount))"),
    theorem("surfaceEveryLabelNamed", f"((surfaceStringCount ({M}surfaceLabelNames)) = 4)"),
    theorem("surfaceEverySourceOneSetting", f"((surfaceSourcesSet ({M}surfaceRoutedSources)) = true)"),
    theorem("surfaceSettingsInGroups", f"((surfaceSettingsGrouped ({M}surfaceSettings)) = true)"),
    theorem("surfaceNoEmptyGroup", "((surfaceGroupsUsed) = true)"),
    theorem("surfaceEveryPairReads", f"((surfacePairsRead ({M}surfaceContrasts)) = true)"),
    theorem("surfaceTonesAreColours", f"((surfaceColoursInRange ({M}surfaceTones)) = true)"),
    theorem("surfaceEveryPlaceIsFed", f"((surfacePlacesFed ({M}surfacePlaces)) = true)"),
    theorem("surfaceTwoThemes", f"((surfaceThemesDiffer ({M}surfaceTones)) = true)"),
    theorem("surfaceVoiceIsJust", f"(((surfaceRatiosJust ({M}surfaceScale)) && (surfaceRatiosJust ({M}surfacePartials))) = true)"),
    theorem("surfaceScaleIsOneOctave", f"(((surfaceInOctave ({M}surfaceScale)) && (surfaceRising 0 1 ({M}surfaceScale))) = true)"),
    theorem("surfaceAnswersInTheScale", f"((surfaceAnswersSound ({M}surfaceAnswers)) = true)"),
    theorem("surfaceVoiceHasRest", f"((surfaceRestSilent ({M}surfaceAnswers)) = true)"),
    theorem("surfaceVoiceIsHumane", f"(((({M}surfaceVoiceCeiling) <=? 10) && ((5 <=? ({M}surfaceVoiceAttack)) && ((({M}surfaceVoiceRelease) <=? 1500) && (150 <=? ({M}surfaceVoiceRefractory))))) = true)"),
]

proofs = [
    "\\begin{lexlean}{PrismSurfaceProofs}",
    "\\useglossary{lexlean.std.bool@1.2.0}",
    "\\useglossary{lexlean.std.nat@1.2.0}",
    "\\useglossary{prism.arch@1.0.0}",
    "\\importmodule{Foundation.Vocab.V1.SchemaOrg}",
    "\\importmodule{Foundation.Vocab.V1.Crosswalk}",
    "\\importmodule{Foundation.Me.V1.Anchors}",
    "\\importmodule{Foundation.Me.V1.Model}",
    "\\importmodule{PrismSurface}",
    "\\title{Prism surface guarantees}",
    "\\begin{semanticmodule}",
    *proofs_defs,
    *theorems,
    "\\end{semanticmodule}",
    "\\end{lexlean}",
    "",
]


import html as _html

e = _html.escape
W = SPEC["words"]
def nav_html():
    """The menu: Today, then the person's places in the spec's order, then the sheet."""
    out = ['  <nav class="pr-nav" id="pr-nav" aria-label="' + e(W["places"]) + '">', '    <ul class="pr-group">']
    for p in SPEC["places"]:
        if p["host"] in ("home", "nav"):
            current = ' aria-current="page"' if p["host"] == "home" else ""
            out.append(f'      <li><button type="button" class="pr-go" data-place="{p["key"]}"{current}>{e(p["name"])}</button></li>')
    out.append("    </ul>")
    for p in SPEC["places"]:
        if p["host"] == "sheet":
            out.append(f'    <button type="button" class="pr-go pr-sheet" data-place="{p["key"]}">{e(p["name"])}</button>')
    out.append("  </nav>")
    return "\n".join(out)


def feeder_of(place):
    """A source that reads into the place's first domain. A place's own act is
    on the place itself, so a card never repeats it."""
    return next((f for f in FEEDERS if f["act"] == "none" and place["domains"][0] in f["domains"]), None)


def home_html():
    """The home: a card per place that holds things, each with the feeder that fills it."""
    out = [f'    <ul id="pr-home" class="pr-home" aria-label="{e(W["places"])}">']
    for p in SPEC["places"]:
        if p["host"] != "nav":
            continue
        f = feeder_of(p)
        # An empty place offers the setup step that fills it, else the source that does.
        if p.get("fills"):
            feed = f'<button type="button" class="pr-card-feed" data-setup="{p["fills"]}" data-place="{p["key"]}">{e(W["setup.connect"])}</button>'
        else:
            feed = f'<button type="button" class="pr-card-feed" data-feed="{f["key"]}" data-place="{p["key"]}">{e(f["word"])}</button>' if f else ""
        out.append(f'      <li class="pr-card pr-card-empty"><button type="button" class="pr-card-go" data-place="{p["key"]}"><span class="pr-card-name">{e(p["name"])}</span><span class="pr-card-count"></span></button><span class="pr-card-latest"></span>{feed}</li>')
    out.append("    </ul>")
    return "\n".join(out)


home_place = next(p for p in SPEC["places"] if p["host"] == "home")
ask_place = next(p for p in SPEC["places"] if p["host"] == "composer")
# The first place's act holds its room from the first paint, so drawing it shifts nothing.
act_held = f' data-act="{home_place["act"]}"' if home_place["act"] != "none" else ""
card_html = f"""<!-- Generated by tools/surface/gen.py from app/specs/surface/spec.json. Do not edit.
     The Prism's places, from PrismSurface: one per owner view of the design
     model in the person's view, then the settings sheet. Every word here is the model's. -->
<div class="pr" data-slot="surface">
{nav_html()}
  <section class="pr-place" id="pr-place" aria-labelledby="pr-title">
    <header class="pr-top"><h2 id="pr-title">{e(home_place["name"])}</h2><span id="pr-count" class="pr-count"></span></header>
    <div id="pr-act" class="pr-act"{act_held}></div>
{home_html()}
    <ol id="pr-list" class="pr-list" aria-labelledby="pr-title"><li class="pr-empty">{e(W["empty"])}</li></ol>
    <div id="pr-settings" class="pr-settings" hidden></div>
  </section>
</div>

<div id="pr-result" data-slot="result" class="result" aria-live="polite"><output id="pr-out" class="idle"></output></div>

<form id="pr-ask" class="pr-ask" data-slot="actions" data-label="{e(ask_place["name"])}">
  <textarea id="pr-prompt" rows="3" aria-label="{e(ask_place["name"])}" placeholder="{e(W["ask.placeholder"])}" autocomplete="off" spellcheck="true"></textarea>
  <button id="pr-ask-go" type="submit">{e(SPEC["acts"][ACTS.index("ask")]["word"])}</button>
</form>
"""

def look_css():
    out = ["/* look: generated by tools/surface/gen.py from app/specs/surface/spec.json; do not edit. */"]
    for font in LOOK["fonts"]:
        m = font["metrics"]
        fallback = f"{font['family']} Fallback"
        out.append(f'@font-face {{ font-family: "{fallback}"; src: local("{font["fallback"]}"); size-adjust: {m["size"]}; '
                   f'ascent-override: {m["ascent"]}; descent-override: {m["descent"]}; line-gap-override: 0%; }}')
        # A font loaded with the gesture is not fetched with the page: the page
        # opens in its metric-matched fallback, and card.mjs adds the font on
        # the person's first touch, or at once when this browser already keeps it.
        if font.get("load", "page") not in ("page", "gesture"):
            refuse(f"font {font['key']} loads with 'page' or 'gesture', not {font.get('load')!r}")
        if font.get("load", "page") == "page":
            out.append(f'@font-face {{ font-family: "{font["family"]}"; src: url("./fonts/{font["file"]}") format("woff2"); '
                       f'font-weight: {font["weight"]}; font-style: normal; font-display: optional; }}')
    fonts = "; ".join(f'--font-{f["key"]}: "{f["family"]}", "{f["family"]} Fallback", {f["fallback"]}, serif' for f in LOOK["fonts"])
    radius = LOOK["radius"]
    for theme, selector in (("light", ":root"), ("dark", ".dark")):
        decls = [f"--vr-{t['key']}: {t[theme]}" for t in LOOK["tones"]]
        decls += [f"--{v}: var(--vr-{t['key']})" for t in LOOK["tones"] for v in t["sets"]]
        if theme == "light":
            decls += [fonts, f"--radius-outer: {radius['outer']}", f"--radius-inner: {radius['inner']}"]
        out.append(f"{selector} {{ " + "; ".join(decls) + "; }")
    out.append("/* look: end */")
    return "\n".join(out) + "\n"


CARD_CSS = (ROOT / "site/card.css").read_text()
BEGIN, END = "/* look: generated", "/* look: end */\n"
if BEGIN in CARD_CSS:
    rest = CARD_CSS[CARD_CSS.index(END) + len(END):]
else:
    rest = CARD_CSS

OUTPUTS = {
    "app/src/PrismSurface.lex.tex": "\n".join(model),
    "app/src/PrismSurfaceProofs.lex.tex": "\n".join(proofs),
    "site/surface/surface.mjs": None,
    "site/card.html": card_html,
    "site/card.css": look_css() + rest,
}
mirror = {
    "domains": SPEC["domains"],
    "floors": SPEC["floors"],
    "labels": SPEC["labels"],
    "roles": SPEC["roles"],
    "acts": SPEC["acts"],
    "places": SPEC["places"],
    "groups": SPEC["groups"],
    "settings": SPEC["settings"],
    "sections": SPEC["sections"],
    "setup": SETUP,
    "media": SPEC["media"],
    "words": SPEC["words"],
    "feeders": FEEDERS,
    "fonts": [{"family": f["family"], "file": f["file"], "weight": f["weight"]} for f in LOOK["fonts"] if f.get("load") == "gesture"],
    # The resonance signal is listened to only when the page carries it, so a
    # page without it never asks for a module it does not have.
    "voice": {**{k: v for k, v in VOICE.items() if k != "comment"},
              "resonance": "../resonance/resonance.mjs" if (ROOT / "site/resonance/resonance.mjs").exists() else None},
}
OUTPUTS["site/surface/surface.mjs"] = (
    "// Generated by tools/surface/gen.py from app/specs/surface/spec.json. Do not edit.\n"
    "// The same records as app/src/PrismSurface.lex.tex, whose proofs bind every\n"
    "// place to its view in the design model. The page renders only these.\n\n"
    + "".join(f"export const {k.upper()} = {json.dumps(v, ensure_ascii=False)};\n" for k, v in mirror.items())
)

# --check: the files on disk are what the spec makes. LexLean's formatter
# only moves whitespace, so the LexLean sources are compared without it.
squash = lambda text: "".join(text.split())
if "--check" in sys.argv:
    stale = [path for path, text in OUTPUTS.items() if squash((ROOT / path).read_text()) != squash(text)]
    if stale:
        refuse("stale, run python3 -I tools/surface/gen.py then lexlean fmt: " + ", ".join(stale))
    print("surface: current")
else:
    for path, text in OUTPUTS.items():
        (ROOT / path).write_text(text)
    print("surface: wrote " + ", ".join(OUTPUTS))
