//! The `prism_models` suite: one test per scenario in `features/suites/prism_models.feature`.
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
    let model = module("app/src/PrismModelsProofs.lex.tex");
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

/// `PMO-01`: The app never answers run when halted is yes
#[test]
fn prism_models_pmo_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismModels::prismModelsHaltedYes))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv001Holds",
    );
}

/// `PMO-02`: The app never answers fetch when halted is yes
#[test]
fn prism_models_pmo_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismModels::prismModelsHaltedYes))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerFetch)))",
        "inv002Holds",
    );
}

/// `PMO-03`: The app never answers run when source is unlocked
#[test]
fn prism_models_pmo_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request source) =? (PrismModels::prismModelsSourceUnlocked))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv003Holds",
    );
}

/// `PMO-04`: The app never answers fetch when source is unlocked
#[test]
fn prism_models_pmo_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request source) =? (PrismModels::prismModelsSourceUnlocked))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerFetch)))",
        "inv004Holds",
    );
}

/// `PMO-05`: The app never answers run when route is ungranted
#[test]
fn prism_models_pmo_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request route) =? (PrismModels::prismModelsRouteUngranted))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv005Holds",
    );
}

/// `PMO-06`: The app never answers fetch when route is ungranted
#[test]
fn prism_models_pmo_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request route) =? (PrismModels::prismModelsRouteUngranted))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerFetch)))",
        "inv006Holds",
    );
}

/// `PMO-07`: The app never answers run when runtime is not match
#[test]
fn prism_models_pmo_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && (not ((project request runtime) =? (PrismModels::prismModelsRuntimeMatch)))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv007Holds",
    );
}

/// `PMO-08`: The app never answers run when weights is not match
#[test]
fn prism_models_pmo_08() {
    pinned(
        "breaksInv008",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && (not ((project request weights) =? (PrismModels::prismModelsWeightsMatch)))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv008Holds",
    );
}

/// `PMO-09`: The app never answers run when format is other
#[test]
fn prism_models_pmo_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((project request source) <? 2) && ((project request format) <? 3)) && ((project request runtime) <? 3)) && ((project request weights) <? 3)) && ((project request route) <? 2)) && ((project request halted) <? 2)) && ((project request format) =? (PrismModels::prismModelsFormatOther))) && ((PrismModels::prismModelsJudge request) =? (PrismModels::prismModelsAnswerRun)))",
        "inv009Holds",
    );
}
