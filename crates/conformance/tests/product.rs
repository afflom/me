//! The `product` suite: `features/suites/product.feature`.
//!
//! The behaviour runs in `pages.yml`: `test/product/gate.test.mjs` (the
//! record's gate and its planted defects), `test/product/screen.test.mjs` and
//! `test/product/journeys.test.mjs` (on the assembled page, and again on the
//! published page). These tests hold the wiring fixed.

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

/// `PD-03`: The product record places every part the Prism has: every surface entry in the person's or the system view, every root facet in the system view serving at least one journey, and every journey with its goal, done-state, usability measure, status and walk; the gate refuses a record that leaves any part unplaced
#[test]
fn product_pd_03() {
    let gate = read("tools/product/gate.py");
    for needle in [
        "is in the Prism but not in the product record",
        "serves no journey",
        "has no usability measure",
        "has no viewpoint in the product record",
    ] {
        assert!(
            gate.contains(needle),
            "PD-03: gate.py must contain `{needle}`"
        );
    }
    let test = read("test/product/gate.test.mjs");
    assert!(
        test.contains("tools/product/gate.py"),
        "PD-03: the planted defects run the gate"
    );
}
