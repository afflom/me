//! The `prism_vault_restore` suite: one test per scenario in `features/suites/prism_vault_restore.feature`.
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
    let model = module("app/src/PrismVaultRestoreProofs.lex.tex");
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

/// `PVR-01`: The app always answers refuse when address is mismatch
#[test]
fn prism_vault_restore_pvr_01() {
    pinned(
        "breaksInv001",
        "body: ((((((((project request key) <? 2) && ((project request format) <? 2)) && ((project request seal) <? 2)) && ((project request address) <? 2)) && ((project request kind) <? 2)) && ((project request address) =? (PrismVaultRestore::prismVaultRestoreAddressMismatch))) && (not ((PrismVaultRestore::prismVaultRestoreJudge request) =? (PrismVaultRestore::prismVaultRestoreAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PVR-02`: The app always answers refuse when seal is broken
#[test]
fn prism_vault_restore_pvr_02() {
    pinned(
        "breaksInv002",
        "body: ((((((((project request key) <? 2) && ((project request format) <? 2)) && ((project request seal) <? 2)) && ((project request address) <? 2)) && ((project request kind) <? 2)) && ((project request seal) =? (PrismVaultRestore::prismVaultRestoreSealBroken))) && (not ((PrismVaultRestore::prismVaultRestoreJudge request) =? (PrismVaultRestore::prismVaultRestoreAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PVR-03`: The app always answers refuse when key is missing
#[test]
fn prism_vault_restore_pvr_03() {
    pinned(
        "breaksInv003",
        "body: ((((((((project request key) <? 2) && ((project request format) <? 2)) && ((project request seal) <? 2)) && ((project request address) <? 2)) && ((project request kind) <? 2)) && ((project request key) =? (PrismVaultRestore::prismVaultRestoreKeyMissing))) && (not ((PrismVaultRestore::prismVaultRestoreJudge request) =? (PrismVaultRestore::prismVaultRestoreAnswerRefuse))))",
        "inv003Holds",
    );
}

/// `PVR-04`: The app never answers restore when format is unknown
#[test]
fn prism_vault_restore_pvr_04() {
    pinned(
        "breaksInv004",
        "body: ((((((((project request key) <? 2) && ((project request format) <? 2)) && ((project request seal) <? 2)) && ((project request address) <? 2)) && ((project request kind) <? 2)) && ((project request format) =? (PrismVaultRestore::prismVaultRestoreFormatUnknown))) && ((PrismVaultRestore::prismVaultRestoreJudge request) =? (PrismVaultRestore::prismVaultRestoreAnswerRestore)))",
        "inv004Holds",
    );
}

/// `PVR-05`: The app never answers restore when kind is hash
#[test]
fn prism_vault_restore_pvr_05() {
    pinned(
        "breaksInv005",
        "body: ((((((((project request key) <? 2) && ((project request format) <? 2)) && ((project request seal) <? 2)) && ((project request address) <? 2)) && ((project request kind) <? 2)) && ((project request kind) =? (PrismVaultRestore::prismVaultRestoreKindHash))) && ((PrismVaultRestore::prismVaultRestoreJudge request) =? (PrismVaultRestore::prismVaultRestoreAnswerRestore)))",
        "inv005Holds",
    );
}
