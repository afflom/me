//! The `prism_google_link` suite: one test per scenario in `features/suites/prism_google_link.feature`.
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
    let model = module("app/src/PrismGoogleLinkProofs.lex.tex");
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

/// `PGL-01`: The app always answers revoked when halted is yes
#[test]
fn prism_google_link_pgl_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismGoogleLink::prismGoogleLinkHaltedYes))) && (not ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerRevoked))))",
        "inv001Holds",
    );
}

/// `PGL-02`: The app never answers granted when actor is not owner and stage is registered
#[test]
fn prism_google_link_pgl_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && (not ((project request actor) =? (PrismGoogleLink::prismGoogleLinkActorOwner)))) && ((project request stage) =? (PrismGoogleLink::prismGoogleLinkStageRegistered))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerGranted)))",
        "inv002Holds",
    );
}

/// `PGL-03`: The app never answers granted when actor is not owner and stage is revoked
#[test]
fn prism_google_link_pgl_03() {
    pinned(
        "breaksInv003",
        "body: (((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && (not ((project request actor) =? (PrismGoogleLink::prismGoogleLinkActorOwner)))) && ((project request stage) =? (PrismGoogleLink::prismGoogleLinkStageRevoked))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerGranted)))",
        "inv003Holds",
    );
}

/// `PGL-04`: The app never answers syncing when actor is operator
#[test]
fn prism_google_link_pgl_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request actor) =? (PrismGoogleLink::prismGoogleLinkActorOperator))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerSyncing)))",
        "inv004Holds",
    );
}

/// `PGL-05`: The app never answers syncing when actor is other
#[test]
fn prism_google_link_pgl_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request actor) =? (PrismGoogleLink::prismGoogleLinkActorOther))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerSyncing)))",
        "inv005Holds",
    );
}

/// `PGL-06`: The app never answers granted when stage is unprovisioned
#[test]
fn prism_google_link_pgl_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request stage) =? (PrismGoogleLink::prismGoogleLinkStageUnprovisioned))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerGranted)))",
        "inv006Holds",
    );
}

/// `PGL-07`: The app never answers syncing when stage is revoked and actor is prism
#[test]
fn prism_google_link_pgl_07() {
    pinned(
        "breaksInv007",
        "body: (((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request stage) =? (PrismGoogleLink::prismGoogleLinkStageRevoked))) && ((project request actor) =? (PrismGoogleLink::prismGoogleLinkActorPrism))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerSyncing)))",
        "inv007Holds",
    );
}

/// `PGL-08`: The app never answers syncing when origin is differs
#[test]
fn prism_google_link_pgl_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request origin) =? (PrismGoogleLink::prismGoogleLinkOriginDiffers))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerSyncing)))",
        "inv008Holds",
    );
}

/// `PGL-09`: The app never answers granted when origin is differs
#[test]
fn prism_google_link_pgl_09() {
    pinned(
        "breaksInv009",
        "body: ((((((((project request stage) <? 5) && ((project request event) <? 6)) && ((project request actor) <? 4)) && ((project request origin) <? 2)) && ((project request halted) <? 2)) && ((project request origin) =? (PrismGoogleLink::prismGoogleLinkOriginDiffers))) && ((PrismGoogleLink::prismGoogleLinkJudge request) =? (PrismGoogleLink::prismGoogleLinkAnswerGranted)))",
        "inv009Holds",
    );
}
