//! The `page` suite: `features/suites/page.feature`.
//!
//! The behaviour is exercised in headless Chromium against the assembled page
//! by `test/page/card.test.mjs` in `pages.yml`. This test holds the wiring
//! fixed: every decision the page acts on comes from the verified app guest,
//! never from the page's own code.

use std::path::PathBuf;

/// `PG-01`: The page keeps, reads and answers only through the verified app: a fact is kept only when the Boundary and the vault allow it, nothing is kept while halted, and every check is the root's own answer
#[test]
fn page_pg_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let card = std::fs::read_to_string(root.join("site/card.mjs")).expect("site/card.mjs");
    for (wiring, why) in [
        (
            "decoder.decode(await app.dispatch(encoder.encode(text)))",
            "every question goes to the verified root guest",
        ),
        (
            "openVault({ decide: routerDecide(line), halted })",
            "the vault's decisions are the root's, and it sees the halt switch",
        ),
        (
            "decide: guestDecider(app.dispatch)",
            "R4's decision is the root's r4 facet",
        ),
        (
            "boundary: (fields) => line(`boundary ${fields}`)",
            "R4's Boundary is the root's boundary facet",
        ),
        (
            "const halted = () => (haltedNow ? \"yes\" : \"no\");",
            "the halt switch reaches the Boundary as its halted field",
        ),
    ] {
        assert!(
            card.contains(wiring),
            "PG-01: {why}: site/card.mjs must contain `{wiring}`"
        );
    }
    assert!(
        !card.contains("fetch(\"http") && !card.contains("fetch('http"),
        "PG-01: the page fetches nothing from another origin"
    );
    let test =
        std::fs::read_to_string(root.join("test/page/card.test.mjs")).expect("the browser test");
    for expected in [
        "\"Kept.\"",
        "\"Not kept: refuse.\"",
        "\"deny\"",
        "\"meets\"",
    ] {
        assert!(
            test.contains(expected),
            "PG-01: the browser test must expect {expected}"
        );
    }
}
