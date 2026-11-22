//! The `prism_ask` suite: one test per scenario in `features/suites/prism_ask.feature`.
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
    let model = module("app/src/PrismAskProofs.lex.tex");
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

/// `PA-01`: The app always answers paused when halted is yes
#[test]
fn prism_ask_pa_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request halted) =? (PrismAsk::prismAskHaltedYes))) && (not ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerPaused))))",
        "inv001Holds",
    );
}

/// `PA-02`: The app never answers keep when intent is question
#[test]
fn prism_ask_pa_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request intent) =? (PrismAsk::prismAskIntentQuestion))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerKeep)))",
        "inv002Holds",
    );
}

/// `PA-03`: The app never answers keep when box is asks
#[test]
fn prism_ask_pa_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request box) =? (PrismAsk::prismAskBoxAsks))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerKeep)))",
        "inv003Holds",
    );
}

/// `PA-04`: The app never answers look when box is asks
#[test]
fn prism_ask_pa_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request box) =? (PrismAsk::prismAskBoxAsks))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerLook)))",
        "inv004Holds",
    );
}

/// `PA-05`: The app never answers answer when held is none
#[test]
fn prism_ask_pa_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request held) =? (PrismAsk::prismAskHeldNone))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerAnswer)))",
        "inv005Holds",
    );
}

/// `PA-06`: The app never answers look when held is none
#[test]
fn prism_ask_pa_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request held) =? (PrismAsk::prismAskHeldNone))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerLook)))",
        "inv006Holds",
    );
}

/// `PA-07`: The app always answers keep when halted is no and clock is not and box is keeps and timed is yes and intent is task
#[test]
fn prism_ask_pa_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request halted) =? (PrismAsk::prismAskHaltedNo))) && ((project request clock) =? (PrismAsk::prismAskClockNot))) && ((project request box) =? (PrismAsk::prismAskBoxKeeps))) && ((project request timed) =? (PrismAsk::prismAskTimedYes))) && ((project request intent) =? (PrismAsk::prismAskIntentTask))) && (not ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerKeep))))",
        "inv007Holds",
    );
}

/// `PA-08`: The app never answers heard when intent is question
#[test]
fn prism_ask_pa_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request intent) =? (PrismAsk::prismAskIntentQuestion))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerHeard)))",
        "inv008Holds",
    );
}

/// `PA-09`: The app never answers heard when act is task
#[test]
fn prism_ask_pa_09() {
    pinned(
        "breaksInv009",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request act) =? (PrismAsk::prismAskActTask))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerHeard)))",
        "inv009Holds",
    );
}

/// `PA-10`: The app never answers heard when timed is yes
#[test]
fn prism_ask_pa_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((((project request halted) <? 2) && ((project request clock) <? 2)) && ((project request box) <? 2)) && ((project request intent) <? 4)) && ((project request timed) <? 2)) && ((project request held) <? 2)) && ((project request act) <? 2)) && ((project request timed) =? (PrismAsk::prismAskTimedYes))) && ((PrismAsk::prismAskJudge request) =? (PrismAsk::prismAskAnswerHeard)))",
        "inv010Holds",
    );
}
