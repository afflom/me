//! The `prism_kappa` suite: one test per scenario in `features/suites/prism_kappa.feature`.
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
    let model = module("app/src/PrismKappaProofs.lex.tex");
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

/// `PK-01`: The app always answers nocolon when colon is absent
#[test]
fn prism_kappa_pk_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonAbsent))) && (not ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerNocolon))))",
        "inv001Holds",
    );
}

/// `PK-02`: The app always answers unknownaxis when colon is present and axis is other
#[test]
fn prism_kappa_pk_02() {
    pinned(
        "breaksInv002",
        "body: (((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request axis) =? (PrismKappa::prismKappaAxisOther))) && (not ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnknownaxis))))",
        "inv002Holds",
    );
}

/// `PK-03`: The app never answers admit when digits is wrong
#[test]
fn prism_kappa_pk_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digits) =? (PrismKappa::prismKappaDigitsWrong))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerAdmit)))",
        "inv003Holds",
    );
}

/// `PK-04`: The app never answers unverified when digits is wrong
#[test]
fn prism_kappa_pk_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digits) =? (PrismKappa::prismKappaDigitsWrong))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnverified)))",
        "inv004Holds",
    );
}

/// `PK-05`: The app never answers admit when hex is bad
#[test]
fn prism_kappa_pk_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request hex) =? (PrismKappa::prismKappaHexBad))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerAdmit)))",
        "inv005Holds",
    );
}

/// `PK-06`: The app never answers unverified when hex is bad
#[test]
fn prism_kappa_pk_06() {
    pinned(
        "breaksInv006",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request hex) =? (PrismKappa::prismKappaHexBad))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnverified)))",
        "inv006Holds",
    );
}

/// `PK-07`: The app never answers admit when digest is mismatch
#[test]
fn prism_kappa_pk_07() {
    pinned(
        "breaksInv007",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digest) =? (PrismKappa::prismKappaDigestMismatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerAdmit)))",
        "inv007Holds",
    );
}

/// `PK-08`: The app never answers unverified when digest is mismatch
#[test]
fn prism_kappa_pk_08() {
    pinned(
        "breaksInv008",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digest) =? (PrismKappa::prismKappaDigestMismatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnverified)))",
        "inv008Holds",
    );
}

/// `PK-09`: The app never answers admit when digest is collision
#[test]
fn prism_kappa_pk_09() {
    pinned(
        "breaksInv009",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digest) =? (PrismKappa::prismKappaDigestCollision))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerAdmit)))",
        "inv009Holds",
    );
}

/// `PK-10`: The app never answers unverified when digest is collision
#[test]
fn prism_kappa_pk_10() {
    pinned(
        "breaksInv010",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digest) =? (PrismKappa::prismKappaDigestCollision))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnverified)))",
        "inv010Holds",
    );
}

/// `PK-11`: The app never answers admit when digest is uncomputed
#[test]
fn prism_kappa_pk_11() {
    pinned(
        "breaksInv011",
        "body: ((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request digest) =? (PrismKappa::prismKappaDigestUncomputed))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerAdmit)))",
        "inv011Holds",
    );
}

/// `PK-12`: The app never answers nocolon when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_12() {
    pinned(
        "breaksInv012",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerNocolon)))",
        "inv012Holds",
    );
}

/// `PK-13`: The app never answers digits when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_13() {
    pinned(
        "breaksInv013",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerDigits)))",
        "inv013Holds",
    );
}

/// `PK-14`: The app never answers badhex when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_14() {
    pinned(
        "breaksInv014",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerBadhex)))",
        "inv014Holds",
    );
}

/// `PK-15`: The app never answers mismatch when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_15() {
    pinned(
        "breaksInv015",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerMismatch)))",
        "inv015Holds",
    );
}

/// `PK-16`: The app never answers collision when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_16() {
    pinned(
        "breaksInv016",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerCollision)))",
        "inv016Holds",
    );
}

/// `PK-17`: The app never answers unverified when colon is present and digits is right and hex is lower and digest is match
#[test]
fn prism_kappa_pk_17() {
    pinned(
        "breaksInv017",
        "body: (((((((((((project request colon) <? 2) && ((project request axis) <? 7)) && ((project request digits) <? 2)) && ((project request hex) <? 2)) && ((project request digest) <? 4)) && ((project request colon) =? (PrismKappa::prismKappaColonPresent))) && ((project request digits) =? (PrismKappa::prismKappaDigitsRight))) && ((project request hex) =? (PrismKappa::prismKappaHexLower))) && ((project request digest) =? (PrismKappa::prismKappaDigestMatch))) && ((PrismKappa::prismKappaJudge request) =? (PrismKappa::prismKappaAnswerUnverified)))",
        "inv017Holds",
    );
}
