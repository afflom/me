//! The `prism_host` suite: one test per scenario in `features/suites/prism_host.feature`.
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
    let model = module("app/src/PrismHostProofs.lex.tex");
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

/// `PH-01`: The app always answers refuse when halted is yes
#[test]
fn prism_host_ph_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismHost::prismHostHaltedYes))) && (not ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PH-02`: The app never answers use when surface is mail
#[test]
fn prism_host_ph_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request surface) =? (PrismHost::prismHostSurfaceMail))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv002Holds",
    );
}

/// `PH-03`: The app never answers use when surface is calendar
#[test]
fn prism_host_ph_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request surface) =? (PrismHost::prismHostSurfaceCalendar))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv003Holds",
    );
}

/// `PH-04`: The app never answers use when present is no
#[test]
fn prism_host_ph_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request present) =? (PrismHost::prismHostPresentNo))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv004Holds",
    );
}

/// `PH-05`: The app never answers offer when present is no
#[test]
fn prism_host_ph_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request present) =? (PrismHost::prismHostPresentNo))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerOffer)))",
        "inv005Holds",
    );
}

/// `PH-06`: The app never answers use when act is none and grant is none and surface is folder
#[test]
fn prism_host_ph_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request grant) =? (PrismHost::prismHostGrantNone))) && ((project request surface) =? (PrismHost::prismHostSurfaceFolder))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv006Holds",
    );
}

/// `PH-07`: The app never answers use when act is none and surface is contacts
#[test]
fn prism_host_ph_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request surface) =? (PrismHost::prismHostSurfaceContacts))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv007Holds",
    );
}

/// `PH-08`: The app never answers use when act is none and surface is paste
#[test]
fn prism_host_ph_08() {
    pinned(
        "breaksInv008",
        "body: (((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request surface) =? (PrismHost::prismHostSurfacePaste))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv008Holds",
    );
}

/// `PH-09`: The app never answers use when act is none and surface is files
#[test]
fn prism_host_ph_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request surface) =? (PrismHost::prismHostSurfaceFiles))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv009Holds",
    );
}

/// `PH-10`: The app never answers use when act is none and surface is drop
#[test]
fn prism_host_ph_10() {
    pinned(
        "breaksInv010",
        "body: (((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request surface) =? (PrismHost::prismHostSurfaceDrop))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv010Holds",
    );
}

/// `PH-11`: The app never answers use when act is none and grant is none and surface is extension
#[test]
fn prism_host_ph_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((project request surface) <? 9) && ((project request present) <? 2)) && ((project request act) <? 2)) && ((project request grant) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismHost::prismHostActNone))) && ((project request grant) =? (PrismHost::prismHostGrantNone))) && ((project request surface) =? (PrismHost::prismHostSurfaceExtension))) && ((PrismHost::prismHostJudge request) =? (PrismHost::prismHostAnswerUse)))",
        "inv011Holds",
    );
}
