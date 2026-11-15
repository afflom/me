//! The `handwritten` suite: one test per scenario in `features/suites/handwritten.feature`.
//!
//! `tools/handwritten/gate.py` measures where every tracked file comes from
//! (app/specs/handwritten/spec.json), this tree and its base revision alike.
//! The ratchet runs in the page build on every pull request and on main
//! (`--check`, which runs every producer and fetches the pinned upstreams);
//! here, without the network, every producer must exist, every generator must
//! be a producer, and every file must have a class. `test/handwritten/gate.test.mjs`
//! plants each defect.

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
        .args(["-I", "tools/handwritten/gate.py", "--lint"])
        .current_dir(root())
        .output()
        .expect("python3 runs");
    assert!(
        out.status.success(),
        "HW-01: the hand-written spec does not hold the tree:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let pipeline = std::fs::read_to_string(root().join("app/specs/pipeline/workflows/pages.yml.json"))
        .expect("the pipeline model is committed");
    assert!(
        pipeline.contains("tools/handwritten/gate.py --check"),
        "HW-01: the page build must run the ratchet"
    );
}
