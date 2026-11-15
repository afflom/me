//! The `product` suite: `features/suites/product.feature`.
//!
//! The behaviour runs in `pages.yml`: `test/product/screen.test.mjs` and
//! `test/product/journeys.test.mjs` (on the assembled page, and again on the
//! published page). The record's gate is the LexLean program
//! generators/product, run by GN-01, which also replays its planted defects
//! (generators/product/cases/) and fails when one gets another report. These
//! tests hold the wiring fixed.

use std::path::PathBuf;

fn read(path: &str) -> String {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    std::fs::read_to_string(root.join(path)).expect(path)
}

fn live(id: &str, suite: &str) {
    let pages = read(".github/workflows/pages.yml");
    let deploy = pages
        .split("\n  deploy:\n")
        .nth(1)
        .expect("pages.yml has a deploy job");
    assert!(
        deploy.contains(suite),
        "{id}: the published page runs {suite}"
    );
}

/// `PD-01`: Every journey of the product record is walked by a synthetic person whose device holds a day of mail and calendar: a journey recorded as working passes in a fresh and a returning browser on every pull request and on the published page, and a journey that passes while recorded as not yet fails until the record says it works
#[test]
fn product_pd_01() {
    let test = read("test/product/journeys.test.mjs");
    for needle in [
        "journey.status === \"works\" ? await walk(browser, server.url, journey, true)",
        "a journey that worked no longer works",
        "set their status to \\\"works\\\"",
        "await device(context);",
    ] {
        assert!(
            test.contains(needle),
            "PD-01: journeys.test.mjs must contain `{needle}`"
        );
    }
    let person = read("test/product/person.mjs");
    for (at, _) in person.match_indices('@') {
        let domain: String = person[at + 1..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
            .collect();
        assert!(
            domain.ends_with("example.org"),
            "PD-01: the synthetic person's addresses are at example.org, not `{domain}`"
        );
    }
    live("PD-01", "test/product/journeys.test.mjs");
}

/// `PD-02`: No word or control the product record assigns to the system view is on the screen, in any place, fresh, returning, or with the person's day arrived and an item opened, beyond the debt the record lists; a word not listed fails, and a listed word that no longer shows fails until it is removed, so the debt only shrinks
#[test]
fn product_pd_02() {
    let test = read("test/product/screen.test.mjs");
    for needle in [
        "for (const pass of [\"fresh\", \"returning\", \"with the day\"])",
        "the system view reached the screen",
        "remove them from \"debt\"",
    ] {
        assert!(
            test.contains(needle),
            "PD-02: screen.test.mjs must contain `{needle}`"
        );
    }
    let harness = read("test/product/harness.mjs");
    assert!(
        harness.contains("product.machinery.terms")
            && harness.contains("view.words[key] === \"system\""),
        "PD-02: the system words come from the product record"
    );
    live("PD-02", "test/product/screen.test.mjs");
}

/// `PD-03`: The product record places every part the Prism has: every surface entry in the person's or the system view, every root facet in the system view serving at least one journey, every journey with its goal, done-state, usability measure, status and walk, and every setting in the person's view one the Prism requires of the person; the gate refuses a record that leaves any part unplaced
#[test]
fn product_pd_03() {
    let gate = read("generators/product/src/GenProduct.lex.tex");
    for needle in [
        "is in the Prism but not in the product record",
        "serves no journey",
        "has no usability measure",
        "has no viewpoint in the product record",
        "but the Prism does not require it of the person",
    ] {
        assert!(
            gate.contains(needle),
            "PD-03: GenProduct.lex.tex must contain `{needle}`"
        );
    }
    let pipeline = read("generators/pipeline.json");
    for generator in [
        "pdsurface",
        "pdjourney",
        "pdorphans",
        "pdfacet",
        "pdfacetsmissing",
        "pdfeature",
        "pdquality",
    ] {
        assert!(
            pipeline.contains(&format!("\"generator\": \"{generator}\"")),
            "PD-03: generators/pipeline.json must run {generator}"
        );
    }
    let cases = std::fs::read_dir(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../generators/product/cases"),
    )
    .expect("PD-03: generators/product/cases holds the planted defects")
    .filter(|e| {
        e.as_ref()
            .map(|e| e.path().extension().is_some_and(|x| x == "request"))
            .unwrap_or(false)
    })
    .count();
    assert!(
        cases > 30,
        "PD-03: the planted defects are generators/product/cases"
    );
    assert!(
        read("tools/generators/run.sh").contains("generators/*/cases/*.request"),
        "PD-03: GN-01 replays every program's cases"
    );
}

/// `PT-01`: Every part of the Prism, each module of its page and of its model, answers what it is, why it is there, who acts in it, where it runs, when it acts and how it is checked, each answer derived from the record and grounded in a stratum of app/specs/parts/spec.json after verdant's W5H certificate; why traces each part through the features, facets and journeys it serves to the stakeholder concerns they answer, and the gate refuses an ungrounded part, an unanswered question, a concern no journey answers or a working journey no part serves, beyond a debt that only shrinks
#[test]
fn product_pt_01() {
    let gate = read("tools/parts/gate.py");
    for needle in [
        "is grounded in no stratum",
        "does not answer",
        "is answered by no journey, always entry or stratum",
        "works, but no feature or facet names a part that serves it",
    ] {
        assert!(
            gate.contains(needle),
            "PT-01: tools/parts/gate.py must contain `{needle}`"
        );
    }
    let test = read("test/parts/gate.test.mjs");
    assert!(
        test.contains("tools/parts/gate.py"),
        "PT-01: the planted defects run the gate"
    );
    // How a part is checked starts from the suites that reach it, which the
    // LexLean program generators/parts writes and GN-01 holds.
    assert!(
        read("generators/pipeline.json").contains("\"output\": \"test/parts/reach.txt\""),
        "PT-01: generators/parts writes test/parts/reach.txt"
    );
    assert!(
        gate.contains("test/parts/reach.txt"),
        "PT-01: tools/parts/gate.py reads the reach generators/parts writes"
    );
}
