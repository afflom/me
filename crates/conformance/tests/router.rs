//! The `router` suite: one test per scenario in `features/suites/router.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (thirteen guarantees, each on
//! exactly `[Quot.sound, propext]`), check the spec still writes the module
//! (`tools/facet/gen.py --check`), run the router and its compiled readers in
//! Node (`site/router/router.test.mjs`), and check that the page keeps the
//! owner's words only after the router has mapped them.

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

/// `RU-01`: Every value of incoming content reaches a Prism feature only as PrismRouter answers
#[test]
fn router_ru_01() {
    let text = read("app/src/PrismRouterProofs.lex.tex");
    for i in 1..=13 {
        let name = format!("routerInv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains("parameters: [request : PrismRouter::RouterRequest],")
                && body.contains(&format!(
                    "statement: ((routerBreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains("routerInv014Holds"),
        "more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "PrismRouterProofs uses Classical.choice"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains("\"src/PrismRouter.lex.tex\"")
            && toml.contains("\"src/PrismRouterProofs.lex.tex\""),
        "PrismRouter and its proofs are lexlean entrypoints"
    );
    assert!(
        read("app/src/Prism.lex.tex").contains("(PrismRouter::routerDispatch rest)"),
        "RU-01: the Prism root routes router to PrismRouter"
    );
    run(
        "python3",
        &[
            "-I",
            "tools/facet/gen.py",
            "app/specs/router/spec.json",
            "--check",
        ],
    );
}

/// `RU-02`: The owner's words are mapped by the R4 router before they are kept
#[test]
fn router_ru_02() {
    run("node", &["site/router/router.test.mjs"]);
    let module = read("site/router/router.mjs");
    assert!(
        module.contains("const answer = (await line(`router ${request}`)).trim();")
            && module.contains(
                "if (answer === \"refuse\") return { ...out, refused: true, domains: [] };"
            ),
        "RU-02: every mapping is the root guest's router answer, and a refusal maps nothing"
    );
    assert!(
        !module.contains("fetch(")
            && !module.contains("XMLHttpRequest")
            && !module.contains("WebSocket")
            && !module.contains("localStorage"),
        "RU-02: the router calls no host and keeps nothing itself"
    );
    let card = read("site/card.mjs");
    let route = card
        .find("const mapped = await route({ source: \"note\", values: { text }, line, halted });")
        .expect("RU-02: the page routes the owner's words through the router");
    let refused = card
        .find("if (mapped.refused) {")
        .expect("RU-02: a refusal stops the keep");
    let put = card
        .find("const result = await vault.put(encoder.encode(text), { label, about });")
        .expect("RU-02: the note is kept with what the router mapped");
    assert!(
        route < refused && refused < put,
        "RU-02: the router maps, then a refusal stops, then the vault keeps"
    );
    assert!(
        !card.contains("askRouted(") && !card.contains("openR4("),
        "RU-02: R4 routes; it no longer writes replies on the page"
    );
}

/// `RU-03`: Every item the owner can read is taken apart and labeled through PrismRouter
#[test]
fn router_ru_03() {
    run("node", &["test/router/labels.test.mjs"]);
    let labels = read("site/router/labels.mjs");
    assert!(
        labels.contains("const r = await route({ source, values, line: once, halted, now, learned });")
            && labels.contains("if (r.refused) { item.labels = null; continue; }")
            && labels.contains("if (item.sealed) { item.labels = null; continue; }"),
        "RU-03: every label is the router's mapping; a refusal or a sealed item labels nothing"
    );
    assert!(
        !labels.contains("fetch(") && !labels.contains("localStorage") && !labels.contains("indexedDB"),
        "RU-03: what the readers learn stays in memory in this browser"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("await labelAll(items, { line, halted, me: meNow() })"),
        "RU-03: the page labels every item it reads"
    );
}
