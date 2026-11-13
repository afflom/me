//! The `realize` suite: one test per scenario in `features/suites/realize.feature`.
//!
//! The Lean kernel checks PrismRealizabilityProofs when `just vv` runs
//! `prismpm verify` on `app/`. What this test holds fixed is what those proofs
//! are about: the gate passes on the specs as they are, the proved model is
//! exactly what the gate writes from them, and every field of every facet has
//! its witness theorem, stated against that facet's own judge.

use std::path::PathBuf;

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

fn camel(name: &str) -> String {
    name.split(['-', '_'])
        .map(|part| {
            let mut chars = part.chars();
            chars.next().map_or_else(String::new, |first| {
                first.to_uppercase().chain(chars).collect()
            })
        })
        .collect()
}

/// `RZ-01`: Every Prism setting does something: every field of every facet spec changes some answer, every rule decides a request no other rule would, every setting drives such a field, and every facet carries a complete eleven-element descriptor, with every witness pair answered by the facet judge as its spec says
#[test]
fn realize_rz_01() {
    let check = std::process::Command::new("python3")
        .args(["-I", "tools/realize/gate.py", "--check"])
        .current_dir(root())
        .output()
        .expect("python3 runs the realizability gate");
    assert!(
        check.status.success(),
        "RZ-01: the realizability gate refuses the Prism:\n{}",
        String::from_utf8_lossy(&check.stderr)
    );

    let model = read("app/specs/realizability/spec.json");
    let proofs = read("app/src/PrismRealizabilityProofs.lex.tex");
    let toml = read("app/lexlean.toml");
    for file in [
        "PrismRealizability.lex.tex",
        "PrismRealizabilityProofs.lex.tex",
    ] {
        assert!(
            toml.contains(&format!("\"src/{file}\"")),
            "RZ-01: src/{file} must be an entrypoint, so prismpm verify proves it"
        );
    }

    // Every facet named in the model has a complete descriptor and one
    // witness theorem per field of its spec, each proved with no axioms.
    let facets = model
        .split("\"facets\": {")
        .nth(1)
        .and_then(|rest| rest.split('}').next())
        .expect("the model names its facets");
    let mut seen = 0;
    for line in facets.lines() {
        let Some(dir) = line
            .trim()
            .strip_prefix('"')
            .and_then(|l| l.split('"').next())
        else {
            continue;
        };
        seen += 1;
        let spec = read(&format!("app/specs/{dir}/spec.json"));
        let fields = spec
            .split("\"fields\":")
            .nth(1)
            .and_then(|rest| rest.split("\"outcomes\"").next())
            .expect("a spec lists its fields before its outcomes");
        let names: Vec<&str> = fields
            .split("\"name\":")
            .skip(1)
            .filter_map(|rest| rest.split('"').nth(1))
            .collect();
        assert!(!names.is_empty(), "RZ-01: {dir} has no fields");
        let facet = camel(dir);
        let mut theorems = vec![format!("realizability{facet}Complete")];
        theorems.extend(
            names
                .iter()
                .map(|n| format!("realizability{facet}{}Matters", camel(n))),
        );
        for theorem in theorems {
            let at = proofs
                .find(&format!("\n  name: {theorem},\n"))
                .unwrap_or_else(|| panic!("RZ-01: {theorem} is not proved"));
            let body = &proofs[at..at + proofs[at..].find("\n}\n").expect("closed")];
            assert!(
                body.contains("proof: reflexivity{}") && body.contains("axioms: []"),
                "RZ-01: {theorem} must be proved by reflexivity with no axioms:\n{body}"
            );
        }
    }
    assert!(seen >= 10, "RZ-01: the model names {seen} facets");
    assert!(
        proofs.contains("\n  name: realizabilityEverySettingBound,\n"),
        "RZ-01: realizabilityEverySettingBound is not proved"
    );
}
