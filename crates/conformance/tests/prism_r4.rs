//! The `prism_r4` suite: one test per scenario in `features/suites/prism_r4.feature`.
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
    let model = module("app/src/PrismR4Proofs.lex.tex");
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

/// `PR-01`: The app never answers answer when weights is mismatch
#[test]
fn prism_r4_pr_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && ((project request weights) =? (PrismR4::prismR4WeightsMismatch))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv001Holds",
    );
}

/// `PR-02`: The app never answers answer when engine is not match
#[test]
fn prism_r4_pr_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && (not ((project request engine) =? (PrismR4::prismR4EngineMatch)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv002Holds",
    );
}

/// `PR-03`: The app never answers answer when mode is routed and route is not granted
#[test]
fn prism_r4_pr_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && ((project request mode) =? (PrismR4::prismR4ModeRouted))) && (not ((project request route) =? (PrismR4::prismR4RouteGranted)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv003Holds",
    );
}

/// `PR-04`: The app never answers answer when mode is compiled and weights is not none
#[test]
fn prism_r4_pr_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && ((project request mode) =? (PrismR4::prismR4ModeCompiled))) && (not ((project request weights) =? (PrismR4::prismR4WeightsNone)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv004Holds",
    );
}

/// `PR-05`: The app never answers answer when mode is inprism and weights is not match
#[test]
fn prism_r4_pr_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && ((project request mode) =? (PrismR4::prismR4ModeInprism))) && (not ((project request weights) =? (PrismR4::prismR4WeightsMatch)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv005Holds",
    );
}

/// `PR-06`: The app never answers answer when mode is not routed and route is not none
#[test]
fn prism_r4_pr_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && (not ((project request mode) =? (PrismR4::prismR4ModeRouted)))) && (not ((project request route) =? (PrismR4::prismR4RouteNone)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv006Holds",
    );
}

/// `PR-07`: The app never answers answer when boundary is not allow
#[test]
fn prism_r4_pr_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((project request mode) <? 3) && ((project request engine) <? 3)) && ((project request weights) <? 4)) && ((project request route) <? 3)) && ((project request boundary) <? 4)) && (not ((project request boundary) =? (PrismR4::prismR4BoundaryAllow)))) && ((PrismR4::prismR4Judge request) =? (PrismR4::prismR4AnswerAnswer)))",
        "inv007Holds",
    );
}
