//! The `dest` suite: one test per scenario in `features/suites/dest.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (eleven guarantees, each on
//! exactly `[Quot.sound, propext]`), run the compiled guest over every request
//! in Node (`site/dest/dest.test.mjs`), and check that the page hands an item
//! out only after the guest answered deliver.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
}

fn node_suite() {
    let result = Command::new("node")
        .arg("site/dest/dest.test.mjs")
        .current_dir(root())
        .output()
        .expect("Node runs the dest suite");
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

/// `DS-01`: The Prism routes an item to a destination only as PrismDest answers
#[test]
fn dest_ds_01() {
    let text = read("app/src/PrismDestProofs.lex.tex");
    for i in 1..=11 {
        let name = format!("destInv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains("parameters: [request : PrismDest::DestRequest],")
                && body.contains(&format!(
                    "statement: ((destBreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains("destInv012Holds"),
        "more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "PrismDestProofs uses Classical.choice"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains("\"src/PrismDest.lex.tex\"")
            && toml.contains("\"src/PrismDestProofs.lex.tex\""),
        "PrismDest and its proofs are lexlean entrypoints"
    );
    let root_module = read("app/src/Prism.lex.tex");
    assert!(
        root_module.contains("(PrismDest::destDispatch rest)"),
        "DS-01: the Prism root routes dest to PrismDest"
    );
    node_suite();
}

/// `DS-02`: The page hands an item out only after the Boundary and PrismDest answer deliver
#[test]
fn dest_ds_02() {
    let page = read("site/dest/dest.mjs");
    let ask = page
        .find("const decided = await ask(item, { act: 'owner', seen });")
        .expect("Send asks the guests with the owner's act and the seal of what was seen");
    let refuse = page
        .find("if (decided.answer !== 'deliver') return decided;")
        .expect("every answer but deliver stops");
    let hand = page
        .find("await handoff(decided.out")
        .expect("the hand-off");
    assert!(
        ask < refuse && refuse < hand,
        "DS-02: the hand-off comes only after deliver"
    );
    assert_eq!(
        page.matches("await handoff(").count(),
        1,
        "DS-02: one hand-off site"
    );
    assert!(
        !page.contains("fetch(") && !page.contains("XMLHttpRequest") && !page.contains("WebSocket"),
        "DS-02: no host is called from the destinations module"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("mountDest($(\"me-dest\"), { line, halted });"),
        "DS-02: the page mounts Destinations on the root guest"
    );
    node_suite();
}
