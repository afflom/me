//! The `prism_learning` suite: one test per scenario in `features/suites/prism_learning.feature`.
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
    let model = module("app/src/PrismLearningProofs.lex.tex");
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

/// `PL-01`: The app never answers confirm when signal is not ownerconfirm
#[test]
fn prism_learning_pl_01() {
    pinned(
        "breaksInv001",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && (not ((project request signal) =? (PrismLearning::prismLearningSignalOwnerconfirm)))) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerConfirm)))",
        "inv001Holds",
    );
}

/// `PL-02`: The app never answers reject when signal is not ownerreject
#[test]
fn prism_learning_pl_02() {
    pinned(
        "breaksInv002",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && (not ((project request signal) =? (PrismLearning::prismLearningSignalOwnerreject)))) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerReject)))",
        "inv002Holds",
    );
}

/// `PL-03`: The app always answers hold when state is confirmed and signal is not ownerreject
#[test]
fn prism_learning_pl_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && ((project request state) =? (PrismLearning::prismLearningStateConfirmed))) && (not ((project request signal) =? (PrismLearning::prismLearningSignalOwnerreject)))) && (not ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerHold))))",
        "inv003Holds",
    );
}

/// `PL-04`: The app always answers hold when state is rejected and signal is not ownerconfirm
#[test]
fn prism_learning_pl_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && ((project request state) =? (PrismLearning::prismLearningStateRejected))) && (not ((project request signal) =? (PrismLearning::prismLearningSignalOwnerconfirm)))) && (not ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerHold))))",
        "inv004Holds",
    );
}

/// `PL-05`: The app never answers consolidate when weight is below 10
#[test]
fn prism_learning_pl_05() {
    pinned(
        "breaksInv005",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && ((project request weight) <? 10)) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerConsolidate)))",
        "inv005Holds",
    );
}

/// `PL-06`: The app never answers raise when weight is above 14
#[test]
fn prism_learning_pl_06() {
    pinned(
        "breaksInv006",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && (14 <? (project request weight))) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerRaise)))",
        "inv006Holds",
    );
}

/// `PL-07`: The app never answers lower when weight is below 2
#[test]
fn prism_learning_pl_07() {
    pinned(
        "breaksInv007",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && ((project request weight) <? 2)) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerLower)))",
        "inv007Holds",
    );
}

/// `PL-08`: The app never answers demote when state is not consolidated
#[test]
fn prism_learning_pl_08() {
    pinned(
        "breaksInv008",
        "body: (((((((project request state) <? 4) && (1 <=? (project request weight))) && ((project request weight) <=? 16)) && ((project request signal) <? 5)) && (not ((project request state) =? (PrismLearning::prismLearningStateConsolidated)))) && ((PrismLearning::prismLearningJudge request) =? (PrismLearning::prismLearningAnswerDemote)))",
        "inv008Holds",
    );
}
