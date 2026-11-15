//! The `system` suite: the Prism is modeled as one system, not only as its decisions.
//!
//! app/specs/system/spec.json is the Prism's OPM system diagram (ISO 19450) at the
//! top of its architecture description (ISO/IEC/IEEE 42010); the LexLean generators
//! systemcheck and system (generators/src/GenSystem.lex.tex) refuse an incomplete
//! model and write app/src/PrismSystem.lex.tex, which `prismpm check` holds to the
//! system model.
//! `SY-01` fails when a component the diagram names is missing, a decision is no
//! part's, the owed parts grow, or a standard is not registered.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// `SY-01`: the Prism is modeled as one system and every component its system diagram names is present
#[test]
fn system_sy_01() {
    let out = Command::new("sh")
        .args(["tools/generators/run.sh", "--check"])
        .current_dir(root())
        .output()
        .expect("sh runs");
    assert!(
        out.status.success(),
        "the system model is incomplete:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}
