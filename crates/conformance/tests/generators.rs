//! The `generators` suite: every generated file is written by a LexLean program.
//!
//! Each directory of generators/ but foundation/ is one LexLean text/3 application
//! whose generators are modules (generators/system: GenSystem; generators/standards:
//! GenWcag and GenAria, the WCAG 2.2 criteria and WAI-ARIA 1.2 roles, states and
//! properties of the standards register; generators/surface: GenSurface, the page's
//! surface.mjs and card.html; generators/look: GenLook, card.css's look block;
//! generators/surfacemodel: GenSurfaceModel, the surface's LexLean model and its proofs;
//! generators/surfaceshell: GenSurfaceShell, the page's set up, site/surface/setup.mjs,
//! and the look's contrasts by WCAG 2.2 criterion; generators/surfacetargets: GenSurfaceTargets, the size of each target by criterion). Native Lean has a
//! fixed time for one program, so families of generators are separate programs;
//! they share generators/foundation, copied into each. tools/generators/build.sh
//! builds one in the locked SDK and pins it in its lock.json; tools/generators/run.sh
//! runs the steps of each generators/<program>/steps.json through them.
//! `GN-01` fails when a program's sources changed since it was built, its Foundation
//! is not generators/foundation, or a committed output is not what its generator
//! writes from its inputs.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// `GN-01`: every output a generator program's steps.json names is what its LexLean generator writes, each generator program is built from its sources as they stand, and every program carries generators/foundation byte for byte
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
