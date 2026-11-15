//! The `guests` suite: every standalone decision guest is as current as the model.
//!
//! app/specs/guests/spec.json lists the core wasm guests the page's Node suites
//! open and the app modules each is built from. `tools/guests/build.sh` builds
//! each in the locked SDK and `tools/guests/gen.py record` keeps the SHA-256 of
//! its project and of its wasm in app/specs/guests/lock.json and in its pin.
//! `GU-01` fails when a guest's modules, vectors or limits changed since it was
//! built, when its wasm is not the one recorded, or when its pin says otherwise.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// `GU-01`: every standalone decision guest the page runs is built in the locked SDK from the modules the Prism compiles
#[test]
fn guests_gu_01() {
    let out = Command::new("python3")
        .args(["-I", "tools/guests/gen.py", "check"])
        .current_dir(root())
        .output()
        .expect("python3 runs");
    assert!(
        out.status.success(),
        "a guest is older than its modules:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}
