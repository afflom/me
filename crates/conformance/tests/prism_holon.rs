//! The `prism_holon` suite: one test per scenario in `features/suites/prism_holon.feature`.
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
    let model = module("app/src/PrismHolonProofs.lex.tex");
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

/// `PHO-01`: The app always answers refuse when halted is yes
#[test]
fn prism_holon_pho_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request halted) =? (PrismHolon::prismHolonHaltedYes))) && (not ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PHO-02`: The app never answers refuse when halted is no
#[test]
fn prism_holon_pho_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request halted) =? (PrismHolon::prismHolonHaltedNo))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerRefuse)))",
        "inv002Holds",
    );
}

/// `PHO-03`: The app always answers restore when halted is no and floor is regressed
#[test]
fn prism_holon_pho_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request halted) =? (PrismHolon::prismHolonHaltedNo))) && ((project request floor) =? (PrismHolon::prismHolonFloorRegressed))) && (not ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerRestore))))",
        "inv003Holds",
    );
}

/// `PHO-04`: The app never answers reconcile when signal is self
#[test]
fn prism_holon_pho_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request signal) =? (PrismHolon::prismHolonSignalSelf))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerReconcile)))",
        "inv004Holds",
    );
}

/// `PHO-05`: The app never answers curate when signal is self
#[test]
fn prism_holon_pho_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request signal) =? (PrismHolon::prismHolonSignalSelf))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerCurate)))",
        "inv005Holds",
    );
}

/// `PHO-06`: The app never answers reconcile when tunable is no
#[test]
fn prism_holon_pho_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request tunable) =? (PrismHolon::prismHolonTunableNo))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerReconcile)))",
        "inv006Holds",
    );
}

/// `PHO-07`: The app never answers curate when tunable is no
#[test]
fn prism_holon_pho_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request tunable) =? (PrismHolon::prismHolonTunableNo))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerCurate)))",
        "inv007Holds",
    );
}

/// `PHO-08`: The app always answers reconcile when halted is no and floor is held and signal is owner and tunable is yes and dissonance is high
#[test]
fn prism_holon_pho_08() {
    pinned(
        "breaksInv008",
        "body: (((((((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request halted) =? (PrismHolon::prismHolonHaltedNo))) && ((project request floor) =? (PrismHolon::prismHolonFloorHeld))) && ((project request signal) =? (PrismHolon::prismHolonSignalOwner))) && ((project request tunable) =? (PrismHolon::prismHolonTunableYes))) && ((project request dissonance) =? (PrismHolon::prismHolonDissonanceHigh))) && (not ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerReconcile))))",
        "inv008Holds",
    );
}

/// `PHO-09`: The app never answers curate when dissonance is high
#[test]
fn prism_holon_pho_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request dissonance) =? (PrismHolon::prismHolonDissonanceHigh))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerCurate)))",
        "inv009Holds",
    );
}

/// `PHO-10`: The app never answers reconcile when dissonance is none and kpi is met
#[test]
fn prism_holon_pho_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request dissonance) =? (PrismHolon::prismHolonDissonanceNone))) && ((project request kpi) =? (PrismHolon::prismHolonKpiMet))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerReconcile)))",
        "inv010Holds",
    );
}

/// `PHO-11`: The app never answers curate when dissonance is none and kpi is met
#[test]
fn prism_holon_pho_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request dissonance) =? (PrismHolon::prismHolonDissonanceNone))) && ((project request kpi) =? (PrismHolon::prismHolonKpiMet))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerCurate)))",
        "inv011Holds",
    );
}

/// `PHO-12`: The app never answers restore when floor is held
#[test]
fn prism_holon_pho_12() {
    pinned(
        "breaksInv012",
        "body: (((((((((project request halted) <? 2) && ((project request floor) <? 2)) && ((project request signal) <? 2)) && ((project request tunable) <? 2)) && ((project request dissonance) <? 3)) && ((project request kpi) <? 2)) && ((project request floor) =? (PrismHolon::prismHolonFloorHeld))) && ((PrismHolon::prismHolonJudge request) =? (PrismHolon::prismHolonAnswerRestore)))",
        "inv012Holds",
    );
}
