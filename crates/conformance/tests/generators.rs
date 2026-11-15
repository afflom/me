//! The `generators` suite: every generated file is written by a LexLean program.
//!
//! generators/ is one LexLean text/3 application whose generators are modules
//! (GenSystem, ...). tools/generators/build.sh builds it in the locked SDK and pins
//! the program in generators/lock.json; tools/generators/run.sh runs the steps of
//! generators/pipeline.json through it.
//! `GN-01` fails when generators/ changed since the program was built, or a
//! committed output is not what its generator writes from its inputs.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// `GN-01`: every output generators/pipeline.json names is what its LexLean generator writes, and the program is built from generators/ as it stands
#[test]
fn generators_gn_01() {
    let out = Command::new("sh")
        .args(["tools/generators/run.sh", "--check"])
        .current_dir(root())
        .output()
        .expect("sh runs");
    assert!(
        out.status.success(),
        "a generated file is stale:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}
