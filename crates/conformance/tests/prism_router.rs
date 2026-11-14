//! The `prism_router` suite: one test per scenario in `features/suites/prism_router.feature`.
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
    let model = module("app/src/PrismRouterProofs.lex.tex");
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

/// `PRO-01`: The app always answers refuse when halted is yes
#[test]
fn prism_router_pro_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedYes))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PRO-02`: The app always answers refuse when halted is no and provider is mismatch
#[test]
fn prism_router_pro_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderMismatch))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PRO-03`: The app never answers map when provider is absent
#[test]
fn prism_router_pro_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request provider) =? (PrismRouter::prismRouterProviderAbsent))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap)))",
        "inv003Holds",
    );
}

/// `PRO-04`: The app always answers map when halted is no and provider is compiled and value is text
#[test]
fn prism_router_pro_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderCompiled))) && ((project request value2) =? (PrismRouter::prismRouterValue2Text))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap))))",
        "inv004Holds",
    );
}

/// `PRO-05`: The app always answers map when halted is no and provider is compiled and value is subject
#[test]
fn prism_router_pro_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderCompiled))) && ((project request value2) =? (PrismRouter::prismRouterValue2Subject))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap))))",
        "inv005Holds",
    );
}

/// `PRO-06`: The app never answers map when value is start
#[test]
fn prism_router_pro_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Start))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap)))",
        "inv006Holds",
    );
}

/// `PRO-07`: The app never answers map when value is party
#[test]
fn prism_router_pro_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Party))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap)))",
        "inv007Holds",
    );
}

/// `PRO-08`: The app always answers direct when halted is no and provider is absent and source is calendar and value is start and feature is time
#[test]
fn prism_router_pro_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderAbsent))) && ((project request source) =? (PrismRouter::prismRouterSourceCalendar))) && ((project request value2) =? (PrismRouter::prismRouterValue2Start))) && ((project request feature) =? (PrismRouter::prismRouterFeatureTime))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerDirect))))",
        "inv008Holds",
    );
}

/// `PRO-09`: The app never answers direct when source is note and value is start
#[test]
fn prism_router_pro_09() {
    pinned(
        "breaksInv009",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request source) =? (PrismRouter::prismRouterSourceNote))) && ((project request value2) =? (PrismRouter::prismRouterValue2Start))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerDirect)))",
        "inv009Holds",
    );
}

/// `PRO-10`: The app always answers map when halted is no and provider is compiled and value is shape and feature is kind
#[test]
fn prism_router_pro_10() {
    pinned(
        "breaksInv010",
        "body: (((((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderCompiled))) && ((project request value2) =? (PrismRouter::prismRouterValue2Shape))) && ((project request feature) =? (PrismRouter::prismRouterFeatureKind))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap))))",
        "inv010Holds",
    );
}

/// `PRO-11`: The app never answers map when value is shape and feature is topic
#[test]
fn prism_router_pro_11() {
    pinned(
        "breaksInv011",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Shape))) && ((project request feature) =? (PrismRouter::prismRouterFeatureTopic))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap)))",
        "inv011Holds",
    );
}

/// `PRO-12`: The app never answers direct when value is shape and feature is topic
#[test]
fn prism_router_pro_12() {
    pinned(
        "breaksInv012",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Shape))) && ((project request feature) =? (PrismRouter::prismRouterFeatureTopic))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerDirect)))",
        "inv012Holds",
    );
}

/// `PRO-13`: The app never answers map when value is shape and feature is party
#[test]
fn prism_router_pro_13() {
    pinned(
        "breaksInv013",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Shape))) && ((project request feature) =? (PrismRouter::prismRouterFeatureParty))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap)))",
        "inv013Holds",
    );
}

/// `PRO-14`: The app never answers direct when value is shape and feature is party
#[test]
fn prism_router_pro_14() {
    pinned(
        "breaksInv014",
        "body: (((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request value2) =? (PrismRouter::prismRouterValue2Shape))) && ((project request feature) =? (PrismRouter::prismRouterFeatureParty))) && ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerDirect)))",
        "inv014Holds",
    );
}

/// `PRO-15`: The app always answers map when halted is no and provider is compiled and value is text and feature is topic
#[test]
fn prism_router_pro_15() {
    pinned(
        "breaksInv015",
        "body: (((((((((((project request source) <? 4) && ((project request value2) <? 5)) && ((project request feature) <? 6)) && ((project request provider) <? 3)) && ((project request halted) <? 2)) && ((project request halted) =? (PrismRouter::prismRouterHaltedNo))) && ((project request provider) =? (PrismRouter::prismRouterProviderCompiled))) && ((project request value2) =? (PrismRouter::prismRouterValue2Text))) && ((project request feature) =? (PrismRouter::prismRouterFeatureTopic))) && (not ((PrismRouter::prismRouterJudge request) =? (PrismRouter::prismRouterAnswerMap))))",
        "inv015Holds",
    );
}
