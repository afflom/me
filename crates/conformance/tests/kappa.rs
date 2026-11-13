//! The `kappa` suite: one test per scenario in `features/suites/kappa.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (eight guarantees, each on
//! exactly `[Quot.sound, propext]`), keep the generated files equal to their
//! spec, run the compiled guest over every label shape in Node
//! (`site/kappa/kappa.test.mjs`), and check that the browser admits only on
//! the guest's answer and computes digests only with its host.

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
    run("node", &["site/kappa/kappa.test.mjs"]);
}

/// `KP-01`: The Prism admits an object under a kappa label only when the proved Prism Kappa decision says admit
#[test]
fn kappa_kp_01() {
    let text = read("app/src/PrismKappaProofs.lex.tex");
    for i in 1..=8 {
        let name = format!("kappaInv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains("parameters: [request : PrismKappa::KappaRequest],")
                && body.contains(&format!(
                    "statement: ((kappaBreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
        let breaks = &text[text
            .find(&format!("  name: kappaBreaksInv{i:03},\n"))
            .unwrap_or_else(|| panic!("kappaBreaksInv{i:03} is missing"))..];
        assert!(
            breaks[..breaks.find("\n}\n").expect("closed")]
                .contains("(PrismKappa::kappaJudge request)"),
            "kappaBreaksInv{i:03} must be about PrismKappa::kappaJudge"
        );
    }
    assert!(
        !text.contains("kappaInv009Holds"),
        "more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "PrismKappaProofs uses Classical.choice"
    );
    let facet = read("app/src/PrismKappa.lex.tex");
    assert!(
        facet.contains("(kappaEncodeAnswer (kappaJudge request) (project request axis))"),
        "KP-01: the answer is decided by the judge the guarantees are about"
    );
    assert!(
        facet.contains("(kappaReadLabel (kappaSliceOf s 0 e) d)"),
        "KP-01: the model reads the label itself"
    );
    assert!(
        !facet.contains("name: application,"),
        "KP-01: PrismKappa is a library of the Prism, not a second application root"
    );
    let spec = read("app/specs/kappa/spec.json");
    for (wire, discriminant, digest) in [
        ("sha256", 0, 32),
        ("sha512", 1, 64),
        ("blake3", 2, 32),
        ("sha1", 3, 20),
        ("sha3-256", 4, 32),
        ("keccak256", 5, 32),
    ] {
        assert!(
            spec.contains(&format!(
                "\"wire\": \"{wire}\", \"discriminant\": {discriminant}, \"digestBytes\": {digest}"
            )),
            "KP-01: the spec names kappa-registry's axis {wire} as Axis does"
        );
    }
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains("\"src/PrismKappa.lex.tex\"")
            && toml.contains("\"src/PrismKappaProofs.lex.tex\""),
        "PrismKappa and its proofs are lexlean entrypoints"
    );
    assert!(
        read("app/src/Prism.lex.tex").contains("(PrismKappa::kappaDispatch rest)"),
        "KP-01: the Prism root routes kappa to PrismKappa"
    );
    run("python3", &["-I", "tools/kappa/gen.py", "--check"]);
    node_suite();
}

/// `KP-02`: The browser re-derives a kappa label's digest only with its host and admits only on the guest's answer
#[test]
fn kappa_kp_02() {
    let page = read("site/kappa/kappa.mjs");
    assert!(
        page.contains("crypto.subtle.digest(axis.host, bytes)"),
        "KP-02: digests come from the host's WebCrypto, named by the spec"
    );
    assert!(
        page.contains("if (!axis || !axis.host || !bytes) return 'uncomputed';"),
        "KP-02: an axis the host cannot compute is uncomputed, never guessed"
    );
    assert!(
        page.contains("const answer = parseAnswer(await decide(`${label} ${word}`));"),
        "KP-02: the admission is the guest's answer"
    );
    assert!(
        !page.contains("fetch(") && !page.contains("XMLHttpRequest") && !page.contains("WebSocket"),
        "KP-02: no host is called from the kappa module"
    );
    let spec = read("app/specs/kappa/spec.json");
    assert_eq!(
        spec.matches("\"host\": \"SHA-").count(),
        2,
        "KP-02: only SHA-256 and SHA-512 are computed by the browser"
    );
    node_suite();
}
