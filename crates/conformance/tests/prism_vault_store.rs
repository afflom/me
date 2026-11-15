//! The `prism_vault_store` suite: one test per scenario in `features/suites/prism_vault_store.feature`.
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
    let model = module("app/src/PrismVaultStoreProofs.lex.tex");
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

/// `PVS-01`: The app always answers refuse when address is mismatch
#[test]
fn prism_vault_store_pvs_01() {
    pinned(
        "breaksInv001",
        "body: (((((((project request boundary) <? 4) && ((project request key) <? 2)) && ((project request address) <? 2)) && ((project request room) <? 2)) && ((project request address) =? (PrismVaultStore::prismVaultStoreAddressMismatch))) && (not ((PrismVaultStore::prismVaultStoreJudge request) =? (PrismVaultStore::prismVaultStoreAnswerRefuse))))",
        "inv001Holds",
    );
}

/// `PVS-02`: The app always answers refuse when boundary is deny
#[test]
fn prism_vault_store_pvs_02() {
    pinned(
        "breaksInv002",
        "body: (((((((project request boundary) <? 4) && ((project request key) <? 2)) && ((project request address) <? 2)) && ((project request room) <? 2)) && ((project request boundary) =? (PrismVaultStore::prismVaultStoreBoundaryDeny))) && (not ((PrismVaultStore::prismVaultStoreJudge request) =? (PrismVaultStore::prismVaultStoreAnswerRefuse))))",
        "inv002Holds",
    );
}

/// `PVS-03`: The app never answers store when boundary is hashonly
#[test]
fn prism_vault_store_pvs_03() {
    pinned(
        "breaksInv003",
        "body: (((((((project request boundary) <? 4) && ((project request key) <? 2)) && ((project request address) <? 2)) && ((project request room) <? 2)) && ((project request boundary) =? (PrismVaultStore::prismVaultStoreBoundaryHashonly))) && ((PrismVaultStore::prismVaultStoreJudge request) =? (PrismVaultStore::prismVaultStoreAnswerStore)))",
        "inv003Holds",
    );
}

/// `PVS-04`: The app never answers store when key is missing
#[test]
fn prism_vault_store_pvs_04() {
    pinned(
        "breaksInv004",
        "body: (((((((project request boundary) <? 4) && ((project request key) <? 2)) && ((project request address) <? 2)) && ((project request room) <? 2)) && ((project request key) =? (PrismVaultStore::prismVaultStoreKeyMissing))) && ((PrismVaultStore::prismVaultStoreJudge request) =? (PrismVaultStore::prismVaultStoreAnswerStore)))",
        "inv004Holds",
    );
}

/// `PVS-05`: The app never answers store when boundary is ask
#[test]
fn prism_vault_store_pvs_05() {
    pinned(
        "breaksInv005",
        "body: (((((((project request boundary) <? 4) && ((project request key) <? 2)) && ((project request address) <? 2)) && ((project request room) <? 2)) && ((project request boundary) =? (PrismVaultStore::prismVaultStoreBoundaryAsk))) && ((PrismVaultStore::prismVaultStoreJudge request) =? (PrismVaultStore::prismVaultStoreAnswerStore)))",
        "inv005Holds",
    );
}
