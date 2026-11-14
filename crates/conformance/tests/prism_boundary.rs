//! The `prism_boundary` suite: one test per scenario in `features/suites/prism_boundary.feature`.
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
    let model = module("app/src/PrismBoundaryProofs.lex.tex");
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

/// `PB-01`: The app always answers deny when halted is yes
#[test]
fn prism_boundary_pb_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismBoundary::prismBoundaryHaltedYes))) && (not ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerDeny))))",
        "inv001Holds",
    );
}

/// `PB-02`: The app always answers deny when destination is github
#[test]
fn prism_boundary_pb_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request destination) =? (PrismBoundary::prismBoundaryDestinationGithub))) && (not ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerDeny))))",
        "inv002Holds",
    );
}

/// `PB-03`: The app always answers deny when destination is verifier
#[test]
fn prism_boundary_pb_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request destination) =? (PrismBoundary::prismBoundaryDestinationVerifier))) && (not ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerDeny))))",
        "inv003Holds",
    );
}

/// `PB-04`: The app never answers allow when detector is not none
#[test]
fn prism_boundary_pb_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && (not ((project request detector) =? (PrismBoundary::prismBoundaryDetectorNone)))) && ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerAllow)))",
        "inv004Holds",
    );
}

/// `PB-05`: The app never answers allow when label is restricted
#[test]
fn prism_boundary_pb_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request label) =? (PrismBoundary::prismBoundaryLabelRestricted))) && ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerAllow)))",
        "inv005Holds",
    );
}

/// `PB-06`: The app never answers allow when destination is outbound and approval is none
#[test]
fn prism_boundary_pb_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request destination) =? (PrismBoundary::prismBoundaryDestinationOutbound))) && ((project request approval) =? (PrismBoundary::prismBoundaryApprovalNone))) && ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerAllow)))",
        "inv006Holds",
    );
}

/// `PB-07`: The app never answers allow when identifier is yes and destination is not browser
#[test]
fn prism_boundary_pb_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((((project request label) <? 5) && ((project request detector) <? 5)) && ((project request destination) <? 4)) && ((project request approval) <? 2)) && ((project request identifier) <? 2)) && ((project request halted) <? 2)) && ((project request identifier) =? (PrismBoundary::prismBoundaryIdentifierYes))) && (not ((project request destination) =? (PrismBoundary::prismBoundaryDestinationBrowser)))) && ((PrismBoundary::prismBoundaryJudge request) =? (PrismBoundary::prismBoundaryAnswerAllow)))",
        "inv007Holds",
    );
}
