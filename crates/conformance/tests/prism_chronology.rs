//! The `prism_chronology` suite: one test per scenario in `features/suites/prism_chronology.feature`.
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
    let model = module("app/src/PrismChronologyProofs.lex.tex");
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

/// `PCH-01`: The app never answers malformed when astart is below aend and bstart is below bend
#[test]
fn prism_chronology_pch_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && ((project request astart) <? (project request aend))) && ((project request bstart) <? (project request bend))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerMalformed)))",
        "inv001Holds",
    );
}

/// `PCH-02`: The app never answers before when aend is at least bstart
#[test]
fn prism_chronology_pch_02() {
    pinned(
        "breaksInv002",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && ((project request bstart) <=? (project request aend))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerBefore)))",
        "inv002Holds",
    );
}

/// `PCH-03`: The app never answers after when bend is at least astart
#[test]
fn prism_chronology_pch_03() {
    pinned(
        "breaksInv003",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && ((project request astart) <=? (project request bend))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerAfter)))",
        "inv003Holds",
    );
}

/// `PCH-04`: The app never answers equals when astart differs from bstart
#[test]
fn prism_chronology_pch_04() {
    pinned(
        "breaksInv004",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && (not ((project request astart) =? (project request bstart)))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerEquals)))",
        "inv004Holds",
    );
}

/// `PCH-05`: The app never answers equals when aend differs from bend
#[test]
fn prism_chronology_pch_05() {
    pinned(
        "breaksInv005",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && (not ((project request aend) =? (project request bend)))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerEquals)))",
        "inv005Holds",
    );
}

/// `PCH-06`: The app never answers meets when aend differs from bstart
#[test]
fn prism_chronology_pch_06() {
    pinned(
        "breaksInv006",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && (not ((project request aend) =? (project request bstart)))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerMeets)))",
        "inv006Holds",
    );
}

/// `PCH-07`: The app never answers during when astart is at most bstart
#[test]
fn prism_chronology_pch_07() {
    pinned(
        "breaksInv007",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && ((project request astart) <=? (project request bstart))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerDuring)))",
        "inv007Holds",
    );
}

/// `PCH-08`: The app never answers overlaps when aend is below bstart
#[test]
fn prism_chronology_pch_08() {
    pinned(
        "breaksInv008",
        "body: (((((((project request astart) <=? 10080) && ((project request aend) <=? 10080)) && ((project request bstart) <=? 10080)) && ((project request bend) <=? 10080)) && ((project request aend) <? (project request bstart))) && ((PrismChronology::prismChronologyJudge request) =? (PrismChronology::prismChronologyAnswerOverlaps)))",
        "inv008Holds",
    );
}
