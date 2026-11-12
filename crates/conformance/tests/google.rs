//! The `google` suite: one test per scenario in `features/suites/google.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (every guarantee present, its
//! axioms exactly `[Quot.sound, propext]`), run the compiled guests over every
//! request in Node (`site/google/google.test.mjs`), and check that the page's
//! policy and the shipped guests are the ones the model names.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
}

/// Every theorem in a proofs module: `n` of them, each `breaksInvNNN = false`
/// over every request, each resting on exactly Quot.sound and propext.
fn proved(proofs: &str, module: &str, prefix: &str, request: &str, n: usize) {
    let text = read(proofs);
    for i in 1..=n {
        let name = format!("{prefix}Inv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{proofs}: {name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains(&format!("parameters: [request : {module}::{request}],"))
                && body.contains(&format!(
                    "statement: (({prefix}BreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains(&format!("{prefix}Inv{:03}Holds", n + 1)),
        "{proofs} has more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "{proofs} uses Classical.choice"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains(&format!("\"src/{module}.lex.tex\""))
            && toml.contains(&format!("\"src/{module}Proofs.lex.tex\"")),
        "{module} and its proofs are lexlean entrypoints"
    );
}

/// The Node suite over the real guests and a test double for Google.
fn node_suite() {
    let result = Command::new("node")
        .arg("site/google/google.test.mjs")
        .current_dir(root())
        .output()
        .expect("Node runs the Google suite");
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

/// `GG-01`: The page makes a Google API call only when PrismGoogle answers fetch, which it never does while halted, to any other host, without a fresh read grant, or for a write without the owner's act
#[test]
fn google_gg_01() {
    proved(
        "app/src/PrismGoogleProofs.lex.tex",
        "PrismGoogle",
        "google",
        "GoogleRequest",
        7,
    );
    let page = read("site/google/google.mjs");
    let ask = page
        .find("const answer = await decide(line);")
        .expect("the page asks PrismGoogle");
    let refuse = page
        .find("if (answer !== 'fetch') throw")
        .expect("the page refuses every answer but fetch");
    let fetch = page.find("await fetchImpl(").expect("the page fetches");
    assert!(
        ask < refuse && refuse < fetch,
        "GG-01: the call is made only after the guest answered fetch"
    );
    assert_eq!(
        page.matches("fetchImpl(").count(),
        1,
        "GG-01: one call site"
    );
    node_suite();
}

/// `GG-02`: The Google connection moves between stages only as PrismGoogleLink answers: only the owner grants, a client for another origin is never used, and the kill switch or a forget revokes every grant
#[test]
fn google_gg_02() {
    proved(
        "app/src/PrismGoogleLinkProofs.lex.tex",
        "PrismGoogleLink",
        "googleLink",
        "GoogleLinkRequest",
        9,
    );
    let platform = read("site/google/platform.json");
    assert!(
        platform.contains("\"schema\": \"prism/google-platform/1\"")
            && platform.contains("\"origins\": [\"https://afflom.github.io\"]"),
        "GG-02: the platform client is declared for this origin"
    );
    node_suite();
}

/// `GG-03`: Mail and calendar items read from Google reach only the browser vault, through the detectors, the router and the Boundary, by GET to the two API hosts with the token only in the Authorization header
#[test]
fn google_gg_03() {
    let relay = read("site/google/relay.mjs");
    assert!(
        relay.contains("history.replaceState(null, '', where.pathname + where.search);")
            && relay.contains("channel.postMessage(await seal(state, fragment));")
            && !relay.contains("localStorage")
            && !relay.contains("indexedDB"),
        "GG-03: the returning page wipes the token from the address and history, sends it sealed, and stores nothing"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("if (await relayConsent()) return;"),
        "GG-03: the page hands a consent return back before doing anything else"
    );
    node_suite();
}
