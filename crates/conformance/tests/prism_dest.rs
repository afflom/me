//! The `prism_dest` suite: one test per scenario in `features/suites/prism_dest.feature`.
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
    let model = module("app/src/PrismDestProofs.lex.tex");
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

/// `PDE-01`: The app always answers refuse when halted is yes
#[test]
fn prism_dest_pde_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismDest::prismDestHaltedYes))) && (not ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PDE-02`: The app always answers refuse when target is other
#[test]
fn prism_dest_pde_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request target) =? (PrismDest::prismDestTargetOther))) && (not ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PDE-03`: The app always answers refuse when cause is orphan
#[test]
fn prism_dest_pde_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request cause) =? (PrismDest::prismDestCauseOrphan))) && (not ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerRefuse))))",
        "inv003Holds",
    );
}

/// `PDE-04`: The app always answers refuse when verdict is deny
#[test]
fn prism_dest_pde_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request verdict) =? (PrismDest::prismDestVerdictDeny))) && (not ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerRefuse))))",
        "inv004Holds",
    );
}

/// `PDE-05`: The app never answers deliver when act is none
#[test]
fn prism_dest_pde_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request act) =? (PrismDest::prismDestActNone))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDeliver)))",
        "inv005Holds",
    );
}

/// `PDE-06`: The app never answers deliver when wording is changed
#[test]
fn prism_dest_pde_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request wording) =? (PrismDest::prismDestWordingChanged))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDeliver)))",
        "inv006Holds",
    );
}

/// `PDE-07`: The app never answers deliver when tone is coercive
#[test]
fn prism_dest_pde_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request tone) =? (PrismDest::prismDestToneCoercive))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDeliver)))",
        "inv007Holds",
    );
}

/// `PDE-08`: The app never answers show when tone is coercive
#[test]
fn prism_dest_pde_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request tone) =? (PrismDest::prismDestToneCoercive))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerShow)))",
        "inv008Holds",
    );
}

/// `PDE-09`: The app never answers deliver when verdict is hashonly
#[test]
fn prism_dest_pde_09() {
    pinned(
        "breaksInv009",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request verdict) =? (PrismDest::prismDestVerdictHashonly))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDeliver)))",
        "inv009Holds",
    );
}

/// `PDE-10`: The app never answers draft when verdict is hashonly
#[test]
fn prism_dest_pde_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request verdict) =? (PrismDest::prismDestVerdictHashonly))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDraft)))",
        "inv010Holds",
    );
}

/// `PDE-11`: The app never answers deliver when target is owner
#[test]
fn prism_dest_pde_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request target) =? (PrismDest::prismDestTargetOwner))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDeliver)))",
        "inv011Holds",
    );
}

/// `PDE-12`: The app never answers draft when target is owner
#[test]
fn prism_dest_pde_12() {
    pinned(
        "breaksInv012",
        "body: ((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request target) =? (PrismDest::prismDestTargetOwner))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerDraft)))",
        "inv012Holds",
    );
}

/// `PDE-13`: The app never answers show when pace is quiet and urgency is normal
#[test]
fn prism_dest_pde_13() {
    pinned(
        "breaksInv013",
        "body: (((((((((((((project request target) <? 5) && ((project request verdict) <? 4)) && ((project request cause) <? 2)) && ((project request act) <? 2)) && ((project request wording) <? 2)) && ((project request tone) <? 2)) && ((project request pace) <? 2)) && ((project request urgency) <? 2)) && ((project request halted) <? 2)) && ((project request pace) =? (PrismDest::prismDestPaceQuiet))) && ((project request urgency) =? (PrismDest::prismDestUrgencyNormal))) && ((PrismDest::prismDestJudge request) =? (PrismDest::prismDestAnswerShow)))",
        "inv013Holds",
    );
}
