//! The `vault` suite: one test per scenario in `features/suites/vault.feature`.
//!
//! Each test runs `site/vault/test/vault-gate.mjs` in Node against the real
//! `vault.mjs`, the real WebCrypto and the guests built from the proved modules,
//! and passes only when every check for its ID passes. The same scenario runs in
//! headless Chromium, over OPFS and the IndexedDB fallback, in `try-page.yml`.

use std::path::PathBuf;
use std::process::Command;

fn gate(id: &str) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let result = Command::new("node")
        .arg("site/vault/test/vault-gate.mjs")
        .arg(id)
        .current_dir(root)
        .output()
        .expect("Node runs the vault gate");
    assert!(
        result.status.success(),
        "{id}: {}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

/// `VS-01`: The vault keeps a value only when the Boundary and the proved store decision allow it.
#[test]
fn vault_vs_01() {
    gate("VS-01");
}

/// `VS-02`: The vault restores a value only when the proved restore decision allows it.
#[test]
fn vault_vs_02() {
    gate("VS-02");
}

/// `VS-03`: The owner's device key never leaves the browser; a passphrase is asked only for an export.
#[test]
fn vault_vs_03() {
    gate("VS-03");
}
