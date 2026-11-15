//! The `prism_uorc` suite: one test per scenario in `features/suites/prism_uorc.feature`.
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
    let model = module("app/src/PrismUorcProofs.lex.tex");
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

/// `PU-01`: The app always answers refuse when halted is yes
#[test]
fn prism_uorc_pu_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request halted) =? (PrismUorc::prismUorcHaltedYes))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PU-02`: The app always answers refuse when seal is broken
#[test]
fn prism_uorc_pu_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request seal) =? (PrismUorc::prismUorcSealBroken))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PU-03`: The app always answers refuse when format is other
#[test]
fn prism_uorc_pu_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request format) =? (PrismUorc::prismUorcFormatOther))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv003Holds",
    );
}

/// `PU-04`: The app always answers refuse when scope is other
#[test]
fn prism_uorc_pu_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request scope) =? (PrismUorc::prismUorcScopeOther))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv004Holds",
    );
}

/// `PU-05`: The app always answers refuse when objects is many
#[test]
fn prism_uorc_pu_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request objects) =? (PrismUorc::prismUorcObjectsMany))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv005Holds",
    );
}

/// `PU-06`: The app always answers refuse when restore is differs
#[test]
fn prism_uorc_pu_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request restore) =? (PrismUorc::prismUorcRestoreDiffers))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv006Holds",
    );
}

/// `PU-07`: The app always answers refuse when restore is failed
#[test]
fn prism_uorc_pu_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request restore) =? (PrismUorc::prismUorcRestoreFailed))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv007Holds",
    );
}

/// `PU-08`: The app always answers refuse when kappa is other
#[test]
fn prism_uorc_pu_08() {
    pinned(
        "breaksInv008",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request kappa) =? (PrismUorc::prismUorcKappaOther))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerRefuse))))",
        "inv008Holds",
    );
}

/// `PU-09`: The app never answers open when act is keep
#[test]
fn prism_uorc_pu_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActKeep))) && ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerOpen)))",
        "inv009Holds",
    );
}

/// `PU-10`: The app never answers keep when act is open
#[test]
fn prism_uorc_pu_10() {
    pinned(
        "breaksInv010",
        "body: (((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActOpen))) && ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerKeep)))",
        "inv010Holds",
    );
}

/// `PU-11`: The app always answers keep when act is keep and halted is no and seal is ok and format is known and scope is standard and objects is one and restore is same and kappa is admit
#[test]
fn prism_uorc_pu_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActKeep))) && ((project request halted) =? (PrismUorc::prismUorcHaltedNo))) && ((project request seal) =? (PrismUorc::prismUorcSealOk))) && ((project request format) =? (PrismUorc::prismUorcFormatKnown))) && ((project request scope) =? (PrismUorc::prismUorcScopeStandard))) && ((project request objects) =? (PrismUorc::prismUorcObjectsOne))) && ((project request restore) =? (PrismUorc::prismUorcRestoreSame))) && ((project request kappa) =? (PrismUorc::prismUorcKappaAdmit))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerKeep))))",
        "inv011Holds",
    );
}

/// `PU-12`: The app always answers open when act is open and halted is no and seal is ok and format is known and scope is standard and objects is one and restore is same and kappa is admit
#[test]
fn prism_uorc_pu_12() {
    pinned(
        "breaksInv012",
        "body: ((((((((((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActOpen))) && ((project request halted) =? (PrismUorc::prismUorcHaltedNo))) && ((project request seal) =? (PrismUorc::prismUorcSealOk))) && ((project request format) =? (PrismUorc::prismUorcFormatKnown))) && ((project request scope) =? (PrismUorc::prismUorcScopeStandard))) && ((project request objects) =? (PrismUorc::prismUorcObjectsOne))) && ((project request restore) =? (PrismUorc::prismUorcRestoreSame))) && ((project request kappa) =? (PrismUorc::prismUorcKappaAdmit))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerOpen))))",
        "inv012Holds",
    );
}

/// `PU-13`: The app always answers keep when act is keep and halted is no and seal is ok and format is known and scope is self and objects is one and restore is same and kappa is admit
#[test]
fn prism_uorc_pu_13() {
    pinned(
        "breaksInv013",
        "body: ((((((((((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActKeep))) && ((project request halted) =? (PrismUorc::prismUorcHaltedNo))) && ((project request seal) =? (PrismUorc::prismUorcSealOk))) && ((project request format) =? (PrismUorc::prismUorcFormatKnown))) && ((project request scope) =? (PrismUorc::prismUorcScopeSelf))) && ((project request objects) =? (PrismUorc::prismUorcObjectsOne))) && ((project request restore) =? (PrismUorc::prismUorcRestoreSame))) && ((project request kappa) =? (PrismUorc::prismUorcKappaAdmit))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerKeep))))",
        "inv013Holds",
    );
}

/// `PU-14`: The app always answers open when act is open and halted is no and seal is ok and format is known and scope is self and objects is one and restore is same and kappa is admit
#[test]
fn prism_uorc_pu_14() {
    pinned(
        "breaksInv014",
        "body: ((((((((((((((((((project request act) <? 2) && ((project request halted) <? 2)) && ((project request seal) <? 2)) && ((project request format) <? 2)) && ((project request scope) <? 3)) && ((project request objects) <? 2)) && ((project request restore) <? 3)) && ((project request kappa) <? 2)) && ((project request act) =? (PrismUorc::prismUorcActOpen))) && ((project request halted) =? (PrismUorc::prismUorcHaltedNo))) && ((project request seal) =? (PrismUorc::prismUorcSealOk))) && ((project request format) =? (PrismUorc::prismUorcFormatKnown))) && ((project request scope) =? (PrismUorc::prismUorcScopeSelf))) && ((project request objects) =? (PrismUorc::prismUorcObjectsOne))) && ((project request restore) =? (PrismUorc::prismUorcRestoreSame))) && ((project request kappa) =? (PrismUorc::prismUorcKappaAdmit))) && (not ((PrismUorc::prismUorcJudge request) =? (PrismUorc::prismUorcAnswerOpen))))",
        "inv014Holds",
    );
}
