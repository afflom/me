//! The `route` suite: one test per scenario in `features/suites/route.feature`.

use std::path::PathBuf;
use std::process::{Command, Output};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn check_register(register: &str) -> Output {
    Command::new("node")
        .args(["tools/route/check-register.mjs", register, "app/src"])
        .current_dir(root())
        .output()
        .expect("Node runs the register check")
}

/// `RT-01`: The vocabulary register the page reads lists schema.org 30.1's 939 types and 1,538 properties, the 12 domains and the 1,229 crosswalk rows in the order of the Lean indices, every source pinned by sha256
#[test]
fn route_rt_01() {
    let result = check_register("site/vocab/register.json");
    assert!(
        result.status.success(),
        "RT-01: {}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );

    // The planted defect: one type renamed on the page side only, so the page
    // would show a name the Lean row does not have. The check must refuse it.
    let text = std::fs::read_to_string(root().join("site/vocab/register.json"))
        .expect("the register is readable");
    let swapped = text.replacen(
        r#""id": "CreativeWork","#,
        r#""id": "CreativeWorkSwapped","#,
        1,
    );
    assert_ne!(text, swapped, "the planted defect applies");
    let planted = std::env::temp_dir().join(format!("rt-01-{}.json", std::process::id()));
    std::fs::write(&planted, swapped).expect("the planted register is writable");
    let result = check_register(planted.to_str().expect("a UTF-8 temp path"));
    let _ = std::fs::remove_file(&planted);
    assert!(
        !result.status.success(),
        "RT-01: a renamed type was not refused"
    );
}
