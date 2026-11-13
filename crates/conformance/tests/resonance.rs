//! The `resonance` suite: one test per scenario in `features/suites/resonance.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (ten guarantees, each on
//! exactly `[Quot.sound, propext]`), check the spec still writes the module
//! (`tools/facet/gen.py --check`), run the compiled guest over every request
//! and the learning loop in Node (`site/resonance/resonance.test.mjs`), and
//! check that the page answers gestures only through the root guest.

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

/// `RS-01`: The Prism answers a gesture of the owner only as PrismResonance answers
#[test]
fn resonance_rs_01() {
    let text = read("app/src/PrismResonanceProofs.lex.tex");
    for i in 1..=10 {
        let name = format!("resonanceInv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains("parameters: [request : PrismResonance::ResonanceRequest],")
                && body.contains(&format!(
                    "statement: ((resonanceBreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains("resonanceInv011Holds"),
        "more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "PrismResonanceProofs uses Classical.choice"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains("\"src/PrismResonance.lex.tex\"")
            && toml.contains("\"src/PrismResonanceProofs.lex.tex\""),
        "PrismResonance and its proofs are lexlean entrypoints"
    );
    assert!(
        read("app/src/Prism.lex.tex").contains("(PrismResonance::resonanceDispatch rest)"),
        "RS-01: the Prism root routes resonance to PrismResonance"
    );
    run(
        "python3",
        &[
            "-I",
            "tools/facet/gen.py",
            "app/specs/resonance/spec.json",
            "--check",
        ],
    );
    run("node", &["site/resonance/resonance.test.mjs"]);
}

/// `RS-02`: The page answers the owner's gestures and learns from them only through the root guest
#[test]
fn resonance_rs_02() {
    let module = read("site/resonance/resonance.mjs");
    assert!(
        module.contains("await line(`resonance ${lineOf(request)}`)")
            && module.contains("await line(`learn ${b.belief} ${b.weight} ${signal}`)"),
        "RS-02: every answer and every learning step is the root guest's"
    );
    assert!(
        !module.contains("fetch(")
            && !module.contains("XMLHttpRequest")
            && !module.contains("WebSocket")
            && !module.contains("localStorage"),
        "RS-02: the resonance module calls no host and keeps nothing itself"
    );
    assert!(
        module.contains("if (!LEARNED.includes(outcome)) return 'refused';")
            && module.contains("const answer = ANSWERS.includes(said) ? said : 'rest';"),
        "RS-02: an unmodeled answer moves nothing"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("makeResonance({ line, halted, attention: pace,"),
        "RS-02: the page asks the root guest, with the owner's halt and quiet"
    );
    assert!(
        card.contains("import(\"./resonance/resonance.mjs\")")
            && !card.contains("from \"./resonance/"),
        "RS-02: resonance loads on demand, never with the page"
    );
}
