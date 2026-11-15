//! The `prism_curate` suite: one test per scenario in `features/suites/prism_curate.feature`.
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
    let model = module("app/src/PrismCurateProofs.lex.tex");
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

/// `PC-01`: The app always answers refuse when halted is yes
#[test]
fn prism_curate_pc_01() {
    pinned(
        "breaksInv001",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request halted) =? (PrismCurate::prismCurateHaltedYes))) && (not ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PC-02`: The app always answers refuse when tunable is no
#[test]
fn prism_curate_pc_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request tunable) =? (PrismCurate::prismCurateTunableNo))) && (not ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PC-03`: The app always answers refuse when label is other
#[test]
fn prism_curate_pc_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request label) =? (PrismCurate::prismCurateLabelOther))) && (not ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRefuse))))",
        "inv003Holds",
    );
}

/// `PC-04`: The app never answers adopt when defect is some
#[test]
fn prism_curate_pc_04() {
    pinned(
        "breaksInv004",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request defect) =? (PrismCurate::prismCurateDefectSome))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv004Holds",
    );
}

/// `PC-05`: The app never answers recall when defect is some
#[test]
fn prism_curate_pc_05() {
    pinned(
        "breaksInv005",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request defect) =? (PrismCurate::prismCurateDefectSome))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv005Holds",
    );
}

/// `PC-06`: The app never answers adopt when evidence is self
#[test]
fn prism_curate_pc_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request evidence) =? (PrismCurate::prismCurateEvidenceSelf))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv006Holds",
    );
}

/// `PC-07`: The app never answers recall when evidence is self
#[test]
fn prism_curate_pc_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request evidence) =? (PrismCurate::prismCurateEvidenceSelf))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv007Holds",
    );
}

/// `PC-08`: The app never answers adopt when floor is regressed
#[test]
fn prism_curate_pc_08() {
    pinned(
        "breaksInv008",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request floor) =? (PrismCurate::prismCurateFloorRegressed))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv008Holds",
    );
}

/// `PC-09`: The app never answers recall when floor is regressed
#[test]
fn prism_curate_pc_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request floor) =? (PrismCurate::prismCurateFloorRegressed))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv009Holds",
    );
}

/// `PC-10`: The app never answers adopt when move is explore and dominance is equal
#[test]
fn prism_curate_pc_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceEqual))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv010Holds",
    );
}

/// `PC-11`: The app never answers recall when move is explore and dominance is equal
#[test]
fn prism_curate_pc_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceEqual))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv011Holds",
    );
}

/// `PC-12`: The app never answers adopt when move is explore and dominance is dominated
#[test]
fn prism_curate_pc_12() {
    pinned(
        "breaksInv012",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceDominated))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv012Holds",
    );
}

/// `PC-13`: The app never answers recall when move is explore and dominance is dominated
#[test]
fn prism_curate_pc_13() {
    pinned(
        "breaksInv013",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceDominated))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv013Holds",
    );
}

/// `PC-14`: The app never answers adopt when move is explore and dominance is incomparable
#[test]
fn prism_curate_pc_14() {
    pinned(
        "breaksInv014",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceIncomparable))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv014Holds",
    );
}

/// `PC-15`: The app never answers recall when move is explore and dominance is incomparable
#[test]
fn prism_curate_pc_15() {
    pinned(
        "breaksInv015",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveExplore))) && ((project request dominance) =? (PrismCurate::prismCurateDominanceIncomparable))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv015Holds",
    );
}

/// `PC-16`: The app never answers adopt when move is reconcile and eased is no
#[test]
fn prism_curate_pc_16() {
    pinned(
        "breaksInv016",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveReconcile))) && ((project request eased) =? (PrismCurate::prismCurateEasedNo))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv016Holds",
    );
}

/// `PC-17`: The app never answers recall when move is reconcile and eased is no
#[test]
fn prism_curate_pc_17() {
    pinned(
        "breaksInv017",
        "body: ((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request move) =? (PrismCurate::prismCurateMoveReconcile))) && ((project request eased) =? (PrismCurate::prismCurateEasedNo))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv017Holds",
    );
}

/// `PC-18`: The app never answers adopt when claim is known
#[test]
fn prism_curate_pc_18() {
    pinned(
        "breaksInv018",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request claim) =? (PrismCurate::prismCurateClaimKnown))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerAdopt)))",
        "inv018Holds",
    );
}

/// `PC-19`: The app never answers recall when claim is new
#[test]
fn prism_curate_pc_19() {
    pinned(
        "breaksInv019",
        "body: (((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request claim) =? (PrismCurate::prismCurateClaimNew))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRecall)))",
        "inv019Holds",
    );
}

/// `PC-20`: The app never answers refuse when halted is no and tunable is yes and label is admit
#[test]
fn prism_curate_pc_20() {
    pinned(
        "breaksInv020",
        "body: (((((((((((((((project request halted) <? 2) && ((project request tunable) <? 2)) && ((project request label) <? 2)) && ((project request defect) <? 2)) && ((project request evidence) <? 2)) && ((project request floor) <? 2)) && ((project request move) <? 2)) && ((project request eased) <? 2)) && ((project request dominance) <? 4)) && ((project request claim) <? 2)) && ((project request halted) =? (PrismCurate::prismCurateHaltedNo))) && ((project request tunable) =? (PrismCurate::prismCurateTunableYes))) && ((project request label) =? (PrismCurate::prismCurateLabelAdmit))) && ((PrismCurate::prismCurateJudge request) =? (PrismCurate::prismCurateAnswerRefuse)))",
        "inv020Holds",
    );
}
