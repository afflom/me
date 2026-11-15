//! The `prism_folder` suite: one test per scenario in `features/suites/prism_folder.feature`.
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
    let model = module("app/src/PrismFolderProofs.lex.tex");
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

/// `PF-01`: The app always answers refuse when halted is yes
#[test]
fn prism_folder_pf_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismFolder::prismFolderHaltedYes))) && (not ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PF-02`: The app always answers refuse when action is write
#[test]
fn prism_folder_pf_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request action) =? (PrismFolder::prismFolderActionWrite))) && (not ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PF-03`: The app never answers read when grant is none
#[test]
fn prism_folder_pf_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request grant) =? (PrismFolder::prismFolderGrantNone))) && ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRead)))",
        "inv003Holds",
    );
}

/// `PF-04`: The app never answers read when grant is prompt
#[test]
fn prism_folder_pf_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request grant) =? (PrismFolder::prismFolderGrantPrompt))) && ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRead)))",
        "inv004Holds",
    );
}

/// `PF-05`: The app never answers read when grant is revoked
#[test]
fn prism_folder_pf_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request grant) =? (PrismFolder::prismFolderGrantRevoked))) && ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRead)))",
        "inv005Holds",
    );
}

/// `PF-06`: The app never answers read when format is other and action is read
#[test]
fn prism_folder_pf_06() {
    pinned(
        "breaksInv006",
        "body: (((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request format) =? (PrismFolder::prismFolderFormatOther))) && ((project request action) =? (PrismFolder::prismFolderActionRead))) && ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRead)))",
        "inv006Holds",
    );
}

/// `PF-07`: The app never answers read when bulk is large and action is read
#[test]
fn prism_folder_pf_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((project request grant) <? 4) && ((project request format) <? 6)) && ((project request action) <? 3)) && ((project request bulk) <? 2)) && ((project request halted) <? 2)) && ((project request bulk) =? (PrismFolder::prismFolderBulkLarge))) && ((project request action) =? (PrismFolder::prismFolderActionRead))) && ((PrismFolder::prismFolderJudge request) =? (PrismFolder::prismFolderAnswerRead)))",
        "inv007Holds",
    );
}
