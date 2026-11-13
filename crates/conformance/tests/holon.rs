//! The `holon` suite: one test per scenario in `features/suites/holon.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (nine holon and thirteen
//! curate guarantees, each on exactly `[Quot.sound, propext]`), keep the
//! generated files equal to their specs, and run the compiled guests and the
//! observer in Node (`site/holon/holon.test.mjs`).

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

fn run(program: &str, args: &[&str]) {
    let result = Command::new(program)
        .args(args)
        .current_dir(root())
        .output()
        .unwrap_or_else(|e| panic!("{program} runs: {e}"));
    assert!(
        result.status.success(),
        "{program} {args:?}\n{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

fn node_suite() {
    run("node", &["site/holon/holon.test.mjs"]);
}

fn guarantees(prefix: &str, module: &str, request: &str, count: usize) {
    let text = read(&format!("app/src/{module}Proofs.lex.tex"));
    for i in 1..=count {
        let name = format!("{prefix}Inv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains(&format!("parameters: [request : {module}::{request}],"))
                && body.contains(&format!(
                    "statement: (({prefix}BreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
        let breaks = &text[text
            .find(&format!("  name: {prefix}BreaksInv{i:03},\n"))
            .unwrap_or_else(|| panic!("{prefix}BreaksInv{i:03} is missing"))..];
        assert!(
            breaks[..breaks.find("\n}\n").expect("closed")]
                .contains(&format!("({module}::{prefix}Judge request)")),
            "{prefix}BreaksInv{i:03} must be about {module}::{prefix}Judge"
        );
    }
    assert!(
        !text.contains(&format!("{prefix}Inv{:03}Holds", count + 1)),
        "more {prefix} guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "{module}Proofs uses Classical.choice"
    );
    let facet = read(&format!("app/src/{module}.lex.tex"));
    assert!(
        facet.contains(&format!("({prefix}EncodeAnswer ({prefix}Judge request))")),
        "the answer is decided by the judge the guarantees are about"
    );
    assert!(
        !facet.contains("name: application,"),
        "{module} is a library of the Prism, not a second application root"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains(&format!("\"src/{module}.lex.tex\""))
            && toml.contains(&format!("\"src/{module}Proofs.lex.tex\"")),
        "{module} and its proofs are lexlean entrypoints"
    );
    assert!(
        read("app/src/Prism.lex.tex").contains(&format!("({module}::{prefix}Dispatch rest)")),
        "the Prism root routes {prefix} to {module}"
    );
}

/// `HL-01`: The observer decides per facet only as the proved PrismHolon answers
#[test]
fn holon_hl_01() {
    guarantees("holon", "PrismHolon", "HolonRequest", 9);
    let spec = read("app/specs/holon/spec.json");
    for facet in [
        "\"id\": \"resonance\"",
        "\"id\": \"places\"",
        "\"id\": \"owner\"",
        "\"id\": \"prism\"",
    ] {
        assert!(
            spec.contains(facet),
            "HL-01: the holon names {facet} as a facet"
        );
    }
    run("python3", &["-I", "tools/holon/gen.py", "--check"]);
    node_suite();
}

/// `HL-02`: A candidate replaces what runs only as the proved PrismCurate answers
#[test]
fn holon_hl_02() {
    guarantees("curate", "PrismCurate", "CurateRequest", 13);
    let spec = read("app/specs/curate/spec.json");
    assert!(
        [
            "11400714819323198485",
            "8170733857868071477",
            "9223372036854775811"
        ]
        .iter()
        .all(|v| spec.contains(&format!("\"{v}\""))),
        "HL-02: the spec carries verdant-resonance's Rule-30 vectors"
    );
    node_suite();
}

/// `HL-03`: The observer runs in the browser on the resonance engine's signals
#[test]
fn holon_hl_03() {
    let page = read("site/holon/holon.mjs");
    assert!(
        page.contains(
            "expect(await decide.curate(CURATE.line(r)), ['adopt', 'recall', 'keep', 'refuse'])"
        ) && page.contains("expect(await decide.holon(HOLON.line(row.request)), HOLON.answers)"),
        "HL-03: every change is the guests' answer, and only an expected one"
    );
    assert!(
        page.contains("(await kappa.admit(label, te.encode(form))).outcome === 'admit'"),
        "HL-03: every claim is named by the kappa facet"
    );
    assert!(
        !page.contains("fetch(") && !page.contains("XMLHttpRequest") && !page.contains("WebSocket"),
        "HL-03: no host is called from the observer"
    );
    node_suite();
}
