//! The `prism_google` suite: one test per scenario in `features/suites/prism_google.feature`.
//!
//! Written by the Prism-DevRel builder from the app's prompt. The theorems are
//! checked by the Lean kernel when `just vv` runs `prismpm verify` on `app/`.
//! What these tests hold fixed is what each theorem is about, so a weakened
//! statement that still verifies fails the gate.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

fn module(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).expect("the module")
}

/// The condition no request may meet, and the theorem that says none does.
fn pinned(breaks: &str, condition: &str, theorem: &str) {
    let model = module("app/src/PrismGoogleProofs.lex.tex");
    let found = declaration(&model, breaks);
    assert!(
        found.contains(condition),
        "the condition of {breaks} changed:\n{found}"
    );
    let holds = declaration(&model, theorem);
    let statement = format!("statement: (({breaks} request) = false),");
    assert!(
        holds.contains(&statement),
        "{theorem} must state that no request meets {breaks}:\n{holds}"
    );
}

/// `PGO-01`: The app always answers refuse when halted is yes
#[test]
fn prism_google_pgo_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismGoogle::prismGoogleHaltedYes))) && (not ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PGO-02`: The app always answers refuse when service is other
#[test]
fn prism_google_pgo_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismGoogle::prismGoogleServiceOther))) && (not ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PGO-03`: The app never answers fetch when method is write and act is none
#[test]
fn prism_google_pgo_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request method) =? (PrismGoogle::prismGoogleMethodWrite))) && ((project request act) =? (PrismGoogle::prismGoogleActNone))) && ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerFetch)))",
        "inv003Holds",
    );
}

/// `PGO-04`: The app never answers fetch when token is none
#[test]
fn prism_google_pgo_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request token) =? (PrismGoogle::prismGoogleTokenNone))) && ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerFetch)))",
        "inv004Holds",
    );
}

/// `PGO-05`: The app never answers fetch when token is expired
#[test]
fn prism_google_pgo_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request token) =? (PrismGoogle::prismGoogleTokenExpired))) && ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerFetch)))",
        "inv005Holds",
    );
}

/// `PGO-06`: The app never answers fetch when scope is none
#[test]
fn prism_google_pgo_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request scope) =? (PrismGoogle::prismGoogleScopeNone))) && ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerFetch)))",
        "inv006Holds",
    );
}

/// `PGO-07`: The app never answers fetch when method is write and scope is readonly
#[test]
fn prism_google_pgo_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((((project request service) <? 3) && ((project request method) <? 2)) && ((project request scope) <? 3)) && ((project request token) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request method) =? (PrismGoogle::prismGoogleMethodWrite))) && ((project request scope) =? (PrismGoogle::prismGoogleScopeReadonly))) && ((PrismGoogle::prismGoogleJudge request) =? (PrismGoogle::prismGoogleAnswerFetch)))",
        "inv007Holds",
    );
}
