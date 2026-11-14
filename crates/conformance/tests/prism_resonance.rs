//! The `prism_resonance` suite: one test per scenario in `features/suites/prism_resonance.feature`.
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
    let model = module("app/src/PrismResonanceProofs.lex.tex");
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

/// `PRE-01`: The app always answers rest when halted is yes
#[test]
fn prism_resonance_pre_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismResonance::prismResonanceHaltedYes))) && (not ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerRest))))",
        "inv001Holds",
    );
}

/// `PRE-02`: The app always answers recede when halted is no and gesture is dismiss
#[test]
fn prism_resonance_pre_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismResonance::prismResonanceHaltedNo))) && ((project request gesture) =? (PrismResonance::prismResonanceGestureDismiss))) && (not ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerRecede))))",
        "inv002Holds",
    );
}

/// `PRE-03`: The app always answers rest when gesture is still
#[test]
fn prism_resonance_pre_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request gesture) =? (PrismResonance::prismResonanceGestureStill))) && (not ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerRest))))",
        "inv003Holds",
    );
}

/// `PRE-04`: The app never answers chime when attention is quiet
#[test]
fn prism_resonance_pre_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request attention) =? (PrismResonance::prismResonanceAttentionQuiet))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChime)))",
        "inv004Holds",
    );
}

/// `PRE-05`: The app never answers bloom when attention is quiet
#[test]
fn prism_resonance_pre_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request attention) =? (PrismResonance::prismResonanceAttentionQuiet))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerBloom)))",
        "inv005Holds",
    );
}

/// `PRE-06`: The app never answers chorus when attention is quiet
#[test]
fn prism_resonance_pre_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request attention) =? (PrismResonance::prismResonanceAttentionQuiet))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv006Holds",
    );
}

/// `PRE-07`: The app never answers bloom when belief is rejected
#[test]
fn prism_resonance_pre_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request belief) =? (PrismResonance::prismResonanceBeliefRejected))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerBloom)))",
        "inv007Holds",
    );
}

/// `PRE-08`: The app never answers chorus when belief is rejected
#[test]
fn prism_resonance_pre_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request belief) =? (PrismResonance::prismResonanceBeliefRejected))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv008Holds",
    );
}

/// `PRE-09`: The app never answers bloom when pace is hurried
#[test]
fn prism_resonance_pre_09() {
    pinned(
        "breaksInv009",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request pace) =? (PrismResonance::prismResonancePaceHurried))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerBloom)))",
        "inv009Holds",
    );
}

/// `PRE-10`: The app never answers chorus when pace is hurried
#[test]
fn prism_resonance_pre_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request pace) =? (PrismResonance::prismResonancePaceHurried))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv010Holds",
    );
}

/// `PRE-11`: The app never answers chorus when belief is inferred
#[test]
fn prism_resonance_pre_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request belief) =? (PrismResonance::prismResonanceBeliefInferred))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv011Holds",
    );
}

/// `PRE-12`: The app never answers bloom when salience is far and gesture is dwell
#[test]
fn prism_resonance_pre_12() {
    pinned(
        "breaksInv012",
        "body: (((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request salience) =? (PrismResonance::prismResonanceSalienceFar))) && ((project request gesture) =? (PrismResonance::prismResonanceGestureDwell))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerBloom)))",
        "inv012Holds",
    );
}

/// `PRE-13`: The app never answers chorus when salience is far and gesture is dwell
#[test]
fn prism_resonance_pre_13() {
    pinned(
        "breaksInv013",
        "body: (((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request salience) =? (PrismResonance::prismResonanceSalienceFar))) && ((project request gesture) =? (PrismResonance::prismResonanceGestureDwell))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv013Holds",
    );
}

/// `PRE-14`: The app never answers bloom when gesture is open
#[test]
fn prism_resonance_pre_14() {
    pinned(
        "breaksInv014",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request gesture) =? (PrismResonance::prismResonanceGestureOpen))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerBloom)))",
        "inv014Holds",
    );
}

/// `PRE-15`: The app never answers chorus when gesture is open
#[test]
fn prism_resonance_pre_15() {
    pinned(
        "breaksInv015",
        "body: ((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request gesture) =? (PrismResonance::prismResonanceGestureOpen))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChorus)))",
        "inv015Holds",
    );
}

/// `PRE-16`: The app never answers chime when phase is night and gesture is open
#[test]
fn prism_resonance_pre_16() {
    pinned(
        "breaksInv016",
        "body: (((((((((((project request gesture) <? 5) && ((project request pace) <? 3)) && ((project request salience) <? 2)) && ((project request phase) <? 4)) && ((project request belief) <? 4)) && ((project request attention) <? 2)) && ((project request halted) <? 2)) && ((project request phase) =? (PrismResonance::prismResonancePhaseNight))) && ((project request gesture) =? (PrismResonance::prismResonanceGestureOpen))) && ((PrismResonance::prismResonanceJudge request) =? (PrismResonance::prismResonanceAnswerChime)))",
        "inv016Holds",
    );
}
