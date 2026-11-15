//! The `handwritten` suite: one test per scenario in `features/suites/handwritten.feature`.
//!
//! `tools/handwritten/gate.py` measures where every tracked file comes from
//! (app/specs/handwritten/spec.json) and keeps app/specs/handwritten/ledger.json.
//! Here the ledger must be current for the tree as it is; the ratchet against
//! the base revision runs on every pull request and on main in the page build
//! (`--full --check`), and `test/handwritten/gate.test.mjs` plants each defect.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// `HW-01`: no part of the Prism is added or grown by hand
#[test]
fn handwritten_hw_01() {
    let out = Command::new("python3")
        .args(["-I", "tools/handwritten/gate.py", "--check", "--no-base"])
        .current_dir(root())
        .output()
        .expect("python3 runs");
    assert!(
        out.status.success(),
        "HW-01: the hand-written ledger is not the tree's:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let ledger = std::fs::read_to_string(root().join("app/specs/handwritten/ledger.json"))
        .expect("the ledger is committed");
    for kind in [
        "\"is\": \"generated\"",
        "\"is\": \"upstream\"",
        "\"is\": \"model\"",
    ] {
        assert!(
            ledger.contains(kind),
            "HW-01: the ledger holds no {kind} file"
        );
    }
}
