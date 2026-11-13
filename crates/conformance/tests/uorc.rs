//! The `uorc` suite: one test per scenario in `features/suites/uorc.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (fourteen guarantees, each on
//! exactly `[Quot.sound, propext]`), run the compiled guest over every request
//! in Node (`site/uorc/uorc.test.mjs`), and hold the lock and the vault's use of
//! the objects in place. `test/uorc/objects.test.mjs` runs the pinned client,
//! both guests and the vault in pages.yml, after the client is served.

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

/// `UO-01`: The Prism keeps or opens an object as a UORC archive only when the proved Prism UORC decision says so
#[test]
fn uorc_uo_01() {
    let text = read("app/src/PrismUorcProofs.lex.tex");
    for i in 1..=14 {
        let name = format!("uorcInv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains("parameters: [request : PrismUorc::UorcRequest],")
                && body.contains(&format!(
                    "statement: ((uorcBreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains("uorcInv015Holds"),
        "more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "PrismUorcProofs uses Classical.choice"
    );
    let facet = read("app/src/PrismUorc.lex.tex");
    assert!(
        facet.contains("(uorcEncodeAnswer (uorcJudge request))"),
        "UO-01: the answer is decided by the judge the guarantees are about"
    );
    assert!(
        read("app/src/Prism.lex.tex").contains("(PrismUorc::uorcDispatch rest)"),
        "UO-01: the Prism root routes uorc to PrismUorc"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains("\"src/PrismUorc.lex.tex\"")
            && toml.contains("\"src/PrismUorcProofs.lex.tex\""),
        "PrismUorc and its proofs are lexlean entrypoints"
    );
    run("node", &["site/uorc/uorc.test.mjs"]);
}

/// `UO-02`: The page runs only the pinned uorc client, checked before it compiles and loaded on first use
#[test]
fn uorc_uo_02() {
    let lock = read("site/uorc/uorc.lock.json");
    assert!(
        lock.contains("\"source\": \"https://github.com/UOR-Foundation/compression/releases/download/v0.4.0/uorc-v0.4.0-wasm.tar.gz\"")
            && lock.contains("\"sha256\": \"aac8bae8c82a1c24a1203dda896637b8c787b36b956785ab609e1dc6bf4cff94\"")
            && lock.contains("\"sha256\": \"361af70018d13745f45206ae5f8dfcf336bf91ce7b79c0d34208517b07f51650\""),
        "UO-02: the lock pins the release asset and the client it serves"
    );
    let boot = read("bootstrap/uorc-objects.mjs");
    assert!(
        boot.contains("if (sha(tgz) !== lock.tarball.sha256) fail(")
            && boot
                .contains("if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail("),
        "UO-02: the build refuses an asset or a file that differs from the lock"
    );
    let objects = read("site/uorc/objects.mjs");
    assert!(
        objects.contains("if (got !== file.sha256 || bytes.length !== file.bytes) {")
            && objects.contains("const module = await WebAssembly.compile(await bytesOf(wasm));"),
        "UO-02: the browser checks the client's bytes before it compiles them"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("import(\"./uorc/objects.mjs\")") && !card.contains("from \"./uorc/"),
        "UO-02: the page imports the objects only on first use"
    );
}

/// `UO-03`: The vault keeps every value as its uorc archive and gives it back only through it
#[test]
fn uorc_uo_03() {
    let vault = read("site/vault/vault.mjs");
    let keep = vault
        .find("const kept = await objects.keep(bytes);")
        .expect("the vault keeps the value through the objects");
    let refuse = vault
        .find("if (kept.outcome !== 'keep') return { outcome: 'refuse' };")
        .expect("anything but keep refuses");
    let write = vault
        .find("const outcome = await write(filed, 'value', encodeRecord(meta, body),")
        .expect("the record's body is what the objects kept");
    assert!(
        keep < refuse && refuse < write,
        "UO-03: the vault writes only after keep"
    );
    assert!(
        vault.contains("const opened = objects ? await objects.open(rec.body, rec.meta.uorc) : { outcome: 'refuse' };"),
        "UO-03: an archive record opens only through the objects"
    );
    assert!(
        read("site/card.mjs")
            .contains("vault = await openVault({ decide: routerDecide(line), halted, objects });"),
        "UO-03: the page opens the vault with the Prism's objects"
    );
}
