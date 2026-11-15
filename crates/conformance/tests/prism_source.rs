//! The `prism_source` suite: one test per scenario in `features/suites/prism_source.feature`.
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
    let model = module("app/src/PrismSourceProofs.lex.tex");
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

/// `PS-01`: The app always answers refuse when halted is yes
#[test]
fn prism_source_ps_01() {
    pinned(
        "breaksInv001",
        "body: (((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismSource::prismSourceHaltedYes))) && (not ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PS-02`: The app always answers refuse when act is write
#[test]
fn prism_source_ps_02() {
    pinned(
        "breaksInv002",
        "body: (((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismSource::prismSourceActWrite))) && (not ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PS-03`: The app never answers read when service is other
#[test]
fn prism_source_ps_03() {
    pinned(
        "breaksInv003",
        "body: (((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismSource::prismSourceServiceOther))) && ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRead)))",
        "inv003Holds",
    );
}

/// `PS-04`: The app never answers read when service is whatsapp and route is own
#[test]
fn prism_source_ps_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismSource::prismSourceServiceWhatsapp))) && ((project request route) =? (PrismSource::prismSourceRouteOwn))) && ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRead)))",
        "inv004Holds",
    );
}

/// `PS-05`: The app never answers read when service is discord and route is own
#[test]
fn prism_source_ps_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismSource::prismSourceServiceDiscord))) && ((project request route) =? (PrismSource::prismSourceRouteOwn))) && ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRead)))",
        "inv005Holds",
    );
}

/// `PS-06`: The app never answers read when service is linkedin and route is own
#[test]
fn prism_source_ps_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismSource::prismSourceServiceLinkedin))) && ((project request route) =? (PrismSource::prismSourceRouteOwn))) && ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRead)))",
        "inv006Holds",
    );
}

/// `PS-07`: The app never answers read when service is linkedin and route is seen
#[test]
fn prism_source_ps_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((project request service) <? 6) && ((project request route) <? 3)) && ((project request act) <? 2)) && ((project request halted) <? 2)) && ((project request service) =? (PrismSource::prismSourceServiceLinkedin))) && ((project request route) =? (PrismSource::prismSourceRouteSeen))) && ((PrismSource::prismSourceJudge request) =? (PrismSource::prismSourceAnswerRead)))",
        "inv007Holds",
    );
}
