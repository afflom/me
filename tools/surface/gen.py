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
unplaced, and a note cannot be kept below its domain's floor. The words are
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
        f"role := {p['role']}, domains := {nats(p['domains'])}, kind := {SHOWS.index(p['show'])}, act := {ACTS.index(p['act'])}}})"
    )


def setting_record(x):
    return (
        f"(record SurfaceSetting {{name := {s(x['name'])}, group := {GROUPS.index(x['group'])}, "
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
  fields: [{name: name, type: String}, {name: group, type: Nat}, {name: source, type: Nat}]
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
    defn("surfaceDomainNames", "(List String)", strings(SPEC["domains"])),
    defn("surfaceLabelNames", "(List String)", strings(SPEC["labels"])),
    defn("surfaceRoleNames", "(List String)", strings(SPEC["roles"])),
    defn("surfaceActWords", "(List String)", strings([a["word"] for a in SPEC["acts"]])),
    defn("surfaceFloors", "(List Nat)", nats(SPEC["floors"])),
    defn("surfacePlaces", "(List SurfacePlace)", records("SurfacePlace", [place_record(p) for p in SPEC["places"]])),
    defn("surfaceGroups", "(List SurfaceGroup)", records("SurfaceGroup", [group_record(g) for g in SPEC["groups"]])),
    defn("surfaceSettings", "(List SurfaceSetting)", records("SurfaceSetting", [setting_record(x) for x in SPEC["settings"]])),
    defn("surfaceWords", "(List SurfaceWord)", records("SurfaceWord", [word_record(k, w) for k, w in SPEC["words"].items()])),
    defn("surfaceRoutedSources", "(List Nat)", nats(routed)),
    defn("surfaceOutboundActs", "(List Nat)", nats(outbound)),
    defn("surfaceGroupCount", "Nat", str(len(GROUPS))),
    defn("surfaceTones", "(List SurfaceTone)", records("SurfaceTone", [tone_record(x) for x in LOOK["tones"]])),
    defn("surfaceContrasts", "(List SurfaceContrast)", records("SurfaceContrast", [contrast_record(x) for x in CONTRASTS])),
    defn("surfaceThemeCount", "Nat", str(len(THEMES))),
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
    rec("surfaceNavRoles", f"[places : (List {M}SurfacePlace)]", "(List Nat)",
        f"(match places\n    | List.nil => (nil Nat)\n    | List.cons place rest => (if ((project place host) =? {nav}) then (cons (project place role) (surfaceNavRoles rest)) else (surfaceNavRoles rest)))", "places"),
    # The menu groups by role: once a role's run ends, it never comes back.
    rec("surfaceRunsContiguous", "[previous : Nat, seen : (List Nat), roles : (List Nat)]", "Bool",
        "(match roles\n    | List.nil => true\n    | List.cons role rest => (if (role =? previous) then (surfaceRunsContiguous previous seen rest) else ((not (surfaceMember role seen)) && (surfaceRunsContiguous role (cons previous seen) rest))))", "roles"),
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
    theorem("surfaceMenuByRole", f"((surfaceRunsContiguous 99 (nil Nat) (surfaceNavRoles ({M}surfacePlaces))) = true)"),
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
    theorem("surfaceTwoThemes", f"((surfaceThemesDiffer ({M}surfaceTones)) = true)"),
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
ROLE_ORDER = []
for p in SPEC["places"]:
    if p["host"] == "nav" and p["role"] not in ROLE_ORDER:
        ROLE_ORDER.append(p["role"])


def nav_html():
    out = ['  <nav class="pr-nav" id="pr-nav" aria-label="' + e(W["places"]) + '">']
    home = [p for p in SPEC["places"] if p["host"] == "home"]
    groups = [home] + [[p for p in SPEC["places"] if p["host"] == "nav" and p["role"] == r] for r in ROLE_ORDER]
    for i, group in enumerate(groups):
        label = SPEC["roles"][group[0]["role"]] if i else W["places"]
        out.append(f'    <ul class="pr-group" aria-label="{e(label)}">')
        for p in group:
            current = ' aria-current="page"' if p["host"] == "home" else ""
            out.append(f'      <li><button type="button" class="pr-go" data-place="{p["key"]}"{current}>{e(p["name"])}</button></li>')
        out.append("    </ul>")
    out.append("  </nav>")
    return "\n".join(out)


home_place = next(p for p in SPEC["places"] if p["host"] == "home")
ask_place = next(p for p in SPEC["places"] if p["host"] == "composer")
card_html = f"""<!-- Generated by tools/surface/gen.py from app/specs/surface/spec.json. Do not edit.
     The Prism's places, from PrismSurface: one per owner view of the design
     model, grouped by role. Every word here is the model's. -->
<div class="pr" data-slot="surface">
{nav_html()}
  <section class="pr-place" id="pr-place" aria-labelledby="pr-title">
    <header class="pr-top"><h2 id="pr-title">{e(home_place["name"])}</h2><span id="pr-count" class="pr-count"></span></header>
    <div id="pr-act" class="pr-act"></div>
    <ol id="pr-list" class="pr-list" aria-labelledby="pr-title"><li class="pr-empty">{e(W["empty"])}</li></ol>
    <div id="pr-settings" class="pr-settings" hidden></div>
  </section>
</div>

<div id="pr-result" data-slot="result" class="result" aria-live="polite"><output id="pr-out" class="idle"></output></div>

<form id="pr-ask" class="pr-ask" data-slot="actions" data-label="{e(ask_place["name"])}">
  <textarea id="pr-prompt" rows="3" aria-label="{e(ask_place["name"])}" placeholder="{e(W["ask.placeholder"])}" autocomplete="off" spellcheck="true"></textarea>
  <button id="pr-ask-go" type="submit">{e(SPEC["acts"][ACTS.index("ask")]["word"])}</button>
</form>

<ol id="pr-log" data-slot="history" data-label="{e(W["recent"])}"></ol>
"""

def look_css():
    out = ["/* look: generated by tools/surface/gen.py from app/specs/surface/spec.json; do not edit. */"]
    for font in LOOK["fonts"]:
        m = font["metrics"]
        fallback = f"{font['family']} Fallback"
        out.append(f'@font-face {{ font-family: "{fallback}"; src: local("{font["fallback"]}"); size-adjust: {m["size"]}; '
                   f'ascent-override: {m["ascent"]}; descent-override: {m["descent"]}; line-gap-override: 0%; }}')
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
    "media": SPEC["media"],
    "words": SPEC["words"],
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
