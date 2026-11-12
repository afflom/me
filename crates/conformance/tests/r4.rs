//! The `r4` suite: one test per scenario in `features/suites/r4.feature`.
//!
//! The Lean kernel checks the Prism R4 decision's proofs when `just vv` runs
//! `prismpm verify` on `app/`, and `test/r4/run.mjs` runs the engine in
//! headless Chromium. What this test holds fixed is what those two are about:
//! the seven guarantees with their exact statements and axioms, the lock that
//! names every byte R4 runs or loads, and its cut into pieces no larger than the
//! limit one served object may have.

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

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

/// Every unsigned number that follows `"key": ` in `text`, in order.
fn numbers(text: &str, key: &str) -> Vec<u64> {
    text.split(&format!("\"{key}\": "))
        .skip(1)
        .map(|rest| {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            digits
                .parse()
                .unwrap_or_else(|_| panic!("\"{key}\" is not a number"))
        })
        .collect()
}

fn is_fingerprint(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256-")
        && value[7..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// What is wrong with an R4 lock: an object larger than the limit served
/// whole, a piece larger than the cut, pieces that do not add up to their
/// object, or a name that is not a SHA-256 fingerprint.
fn lock_problems(lock: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let limit = numbers(lock, "limitBytes");
    let cut = numbers(lock, "pieceBytes");
    if limit != [16_777_216] {
        problems.push(format!("limitBytes is {limit:?}, not 16 MiB"));
    }
    let cut = cut.first().copied().unwrap_or(0);
    if cut == 0 || cut > 16_777_216 {
        problems.push(format!("pieceBytes {cut} is not within the limit"));
    }
    let objects: Vec<&str> = lock.split("\"pieces\": [").collect();
    if objects.len() != 4 {
        problems.push(format!(
            "{} objects are cut into pieces, the glue, the engine and the weights are 3",
            objects.len() - 1
        ));
    }
    for pair in objects.windows(2) {
        let whole = numbers(pair[0], "bytes").last().copied().unwrap_or(0);
        let list = pair[1].split(']').next().unwrap_or_default();
        let pieces = numbers(list, "bytes");
        if pieces.iter().any(|&n| n == 0 || n > cut) {
            problems.push(format!("a piece is larger than {cut} bytes: {pieces:?}"));
        }
        if pieces.iter().sum::<u64>() != whole {
            problems.push(format!("pieces {pieces:?} do not add up to {whole} bytes"));
        }
    }
    for value in lock.split("\"fingerprint\": \"").skip(1) {
        let value = value.split('"').next().unwrap_or_default();
        if !is_fingerprint(value) {
            problems.push(format!("{value} is not a SHA-256 fingerprint"));
        }
    }
    let commit = lock
        .split("\"commit\": \"")
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .unwrap_or_default();
    if commit.len() != 40 || !commit.bytes().all(|b| b.is_ascii_hexdigit()) {
        problems.push(format!(
            "the engine's source commit `{commit}` is not pinned"
        ));
    }
    problems
}

/// `R4-01`: The R4 language model runs in the browser only from bytes that re-derive to their pinned SHA-256, served by the page in pieces of at most 16 MiB, and shows an answer only when the proved Prism R4 decision allows it
#[test]
fn r4_r4_01() {
    // The decision: seven guarantees, each over every request, on Quot.sound
    // and propext alone.
    let model = read("app/src/PrismR4.lex.tex");
    let proofs = read("app/src/PrismR4Proofs.lex.tex");
    for text in [&model, &proofs] {
        assert!(
            !text.contains("Classical.choice"),
            "R4-01: the Prism R4 decision must not rest on Classical.choice"
        );
    }
    for n in 1..=7 {
        let theorem = declaration(&proofs, &format!("r4Inv00{n}Holds"));
        assert!(
            theorem.contains("parameters: [request : PrismR4::R4Request],")
                && theorem.contains(&format!("statement: ((r4BreaksInv00{n} request) = false),"))
                && theorem.contains("axioms: [Quot.sound, propext]"),
            "R4-01: guarantee {n} changed its statement or axioms:\n{theorem}"
        );
    }
    // INV-001: wrong weight bytes are never answered from.
    assert!(
        declaration(&proofs, "r4BreaksInv001").contains(
            "((project request weights) =? (PrismR4::r4WeightsMismatch))) && ((PrismR4::r4Judge request) =? (PrismR4::r4AnswerAnswer))"
        ),
        "R4-01: INV-001 no longer says mismatched weights are never answered from"
    );
    let project = read("app/lexlean.toml");
    for entry in ["src/PrismR4.lex.tex", "src/PrismR4Proofs.lex.tex"] {
        assert!(
            project.contains(&format!("\"{entry}\"")),
            "R4-01: {entry} is not an entrypoint, so verify would not check it"
        );
    }

    // The lock: every object pinned, cut into pieces within the limit.
    let lock = read("site/r4/r4.lock.json");
    let problems = lock_problems(&lock);
    assert!(problems.is_empty(), "R4-01:\n{}", problems.join("\n"));

    // The browser side checks each piece and each object, and decides nothing.
    let pieces = read("site/r4/pieces.mjs");
    assert!(
        pieces.contains("(await fingerprint(bytes)) !== piece.fingerprint")
            && pieces.contains("(await fingerprint(whole)) !== entry.fingerprint")
            && pieces.contains("new DecompressionStream(\"gzip\")"),
        "R4-01: pieces.mjs must check every piece and the joined object"
    );
    let adapter = read("site/r4/r4.mjs");
    assert!(
        adapter.contains("throw new Refusal(\"NoDecision\")")
            && adapter.contains("if (typeof boundary !== \"function\") return \"deny\";"),
        "R4-01: without the Prism R4 decision or the Boundary, the adapter must show nothing"
    );

    // Planted defects: the checker refuses an oversized piece, a lost piece and
    // an unpinned fingerprint.
    let oversized = lock.replacen("\"bytes\": 8388608", "\"bytes\": 16777217", 1);
    assert!(!lock_problems(&oversized).is_empty());
    let lost = lock.replacen("\"bytes\": 1340026", "\"bytes\": 1340025", 1);
    assert!(!lock_problems(&lost).is_empty());
    let unpinned = lock.replacen("sha256-22b96912", "sha256-22B96912", 1);
    assert!(!lock_problems(&unpinned).is_empty());
    let whole = lock.replacen("\"pieceBytes\": 8388608", "\"pieceBytes\": 67108864", 1);
    assert!(!lock_problems(&whole).is_empty());
}
