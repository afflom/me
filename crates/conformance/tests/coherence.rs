//! The `coherence` suite: `features/suites/coherence.feature`.
//!
//! The behaviour runs in `pages.yml`: `test/coherence/coherence.test.mjs`
//! (the gate and its planted defects, the runtime modules) and
//! `test/page/person.test.mjs` (the page used as its owner uses it, on the
//! assembled page and again on the published one). These tests hold the
//! wiring fixed, so the page cannot drift from the registry it runs on.

use std::path::PathBuf;

fn read(path: &str) -> String {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    std::fs::read_to_string(root.join(path)).expect(path)
}

fn holds(id: &str, file: &str, text: &str, wiring: &[(&str, &str)]) {
    for (needle, why) in wiring {
        assert!(
            text.contains(needle),
            "{id}: {why}: {file} must contain `{needle}`"
        );
    }
}

/// `CO-01`: The owner brings content in through the feeders the coherence registry names and every place that lists things lists it: Today shows the agenda ahead with what falls today and what clashes as PrismChronology answers, and Ask answers at once with the owner's own kept items that meet it, only as the Boundary allows, never while halted
#[test]
fn coherence_co_01() {
    let card = read("site/card.mjs");
    holds(
        "CO-01",
        "site/card.mjs",
        &card,
        &[
            (
                "item.domains = item.mapped ?? domainsOf(item);",
                "every kept item is placed where the R4 router mapped it, else by the registry's domains",
            ),
            (
                "(item.domains ?? [item.domain]).some((d) => current.domains.includes(d))",
                "a place lists every item in its domains",
            ),
            (
                "const relate = async (a, b, c, d) => line(`when ${a} ${b} ${c} ${d}`);",
                "Today's spans are PrismChronology's answers",
            ),
            (
                "const word = await line(`boundary ${label} none browser none yes ${halted()}`);",
                "Ask shows kept items only as the Boundary allows",
            ),
            (
                "const shown = word === \"allow\" ? used : [];",
                "nothing is shown that the Boundary did not allow",
            ),
            (
                "homeCards();\n    list.hidden = !items.length;",
                "an empty Today shows its places' cards, each offering its feeder",
            ),
        ],
    );
    let walk = read("test/page/person.test.mjs");
    holds(
        "CO-01",
        "test/page/person.test.mjs",
        &walk,
        &[
            (
                "site/coherence/coherence.mjs",
                "the walk is generated from the registry",
            ),
            (
                "places with nothing after every feeder ran",
                "every listing place must list something",
            ),
            ("pr-clash", "the clash is checked"),
            ("/^No answer$/", "an Ask nothing kept meets says so"),
            ("/^Paused$/", "Ask while paused shows nothing kept"),
        ],
    );
    let pages = read(".github/workflows/pages.yml");
    assert!(
        pages.contains("test/page/person.test.mjs"),
        "CO-01: the published page runs the person walk"
    );
}

/// `CO-02`: Every facet the Prism root routes is one model in the coherence registry with typed ports, live with the page modules that ask it or sealed by a PrismHost surface, and the build refuses a registry whose flow leaves a port unproduced or untaken, a place unfed, an act or setting undriven, a feeder's media without a domain or a domain without vocabulary
#[test]
fn coherence_co_02() {
    let gen = read("tools/coherence/gen.py");
    holds(
        "CO-02",
        "tools/coherence/gen.py",
        &gen,
        &[
            (
                "but the registry has no model of it",
                "a root facet must be modeled",
            ),
            (
                "asks the root for",
                "a live facet must be asked by its modules",
            ),
            ("which no live facet gives", "every port taken is produced"),
            (
                "which no facet takes and the owner never sees",
                "every port given is taken or seen",
            ),
            (
                "lists items but no feeder reaches its domains",
                "every place is fed",
            ),
            (
                "is driven by no live facet",
                "every act and setting is driven",
            ),
            (
                "which has no domain in the surface's media table",
                "every feeder's media has a domain",
            ),
            ("needs its vocabulary", "every domain has vocabulary"),
            (
                "is sealed but drives the page",
                "a sealed facet shows nothing",
            ),
        ],
    );
    let test = read("test/coherence/coherence.test.mjs");
    for planted in [
        "the root routes when",
        "asks the root for 'when'",
        "gives 'span'",
        "setting halt is driven by no live facet",
        "'fax', which has no domain",
        "needs its vocabulary",
        "google is sealed but drives the page",
        "act 'write' is driven by no live facet",
    ] {
        assert!(
            test.contains(planted),
            "CO-02: the gate must be shown refusing: {planted}"
        );
    }
    let generated = read("site/coherence/coherence.mjs");
    assert!(
        generated.starts_with("// Generated by tools/coherence/gen.py"),
        "CO-02: coherence.mjs is generated"
    );
}

/// `CO-03`: A kept item belongs to its media's domain and to every domain whose vocabulary in the coherence registry it uses, and an Ask finds the span its intent words name
#[test]
fn coherence_co_03() {
    let sense = read("site/coherence/sense.mjs");
    holds(
        "CO-03",
        "site/coherence/sense.mjs",
        &sense,
        &[
            (
                "import { VOCABULARY, INTENTS, MEDIA } from \"./coherence.mjs\";",
                "words come only from the registry",
            ),
            (
                "if (item.sealed) return [...out];",
                "a sealed item is placed by its media alone",
            ),
            (
                "if (item.sealed) continue;",
                "a sealed item is never drawn on",
            ),
        ],
    );
    let today = read("site/coherence/today.mjs");
    assert!(
        today.contains("await relate(s, e, 0, 1440)"),
        "CO-03: what falls today is PrismChronology's answer"
    );
}

/// `CO-04`: A zip the owner picks or drops, such as a Google Takeout export, opens in the browser to its entries, stored or deflated and ZIP64 included, each judged by PrismFolder by its own format
#[test]
fn coherence_co_04() {
    let zip = read("site/device/zip.mjs");
    holds(
        "CO-04",
        "site/device/zip.mjs",
        &zip,
        &[
            (
                "new DecompressionStream(\"deflate-raw\")",
                "deflated entries are inflated by the browser",
            ),
            ("0x07064b50", "ZIP64 is read"),
        ],
    );
    let device = read("site/device/device.mjs");
    assert!(
        device.contains("const format = formatOf(file.name, file.parent ?? '');"),
        "CO-04: each entry is judged by its own format"
    );
}

/// `CO-05`: A returning owner gets the deploy that is served: when the version precache.json names differs from every cache the page keeps, the page drops the kept deploy and loads once more, and every button on Today does something when pressed
#[test]
fn coherence_co_05() {
    let card = read("site/card.mjs");
    holds("CO-05", "site/card.mjs", &card, &[
        ("export default async function start({ app, reason, $ }) {\n  if (await heal()) return;", "the page heals before anything else runs"),
        ("ours.includes(`prism-${served.version}`)", "a kept cache of the served version is left alone"),
        ("sessionStorage.getItem(HEALED_KEY) === served.version", "the heal happens once per version and tab"),
        ("await registration.unregister();", "the kept worker is let go"),
    ]);
    let test = read("test/page/returning.test.mjs");
    holds(
        "CO-05",
        "test/page/returning.test.mjs",
        &test,
        &[
            (
                "prism-0000000000000000",
                "a kept earlier deploy is simulated",
            ),
            (
                "buttons that did nothing",
                "every Today button must respond",
            ),
        ],
    );
    let pages = read(".github/workflows/pages.yml");
    assert!(
        pages.contains("test/page/returning.test.mjs"),
        "CO-05: the published page runs the returning walk"
    );
}
