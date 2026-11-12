//! The `models` suite: one test per scenario in `features/suites/models.feature`.
//!
//! The Lean kernel checks the Prism Models decision's proofs when `just vv`
//! runs `prismpm verify` on `app/`, and `test/models/run.mjs` runs the routed
//! models in headless Chromium. What this test holds fixed is what those two
//! are about: the nine guarantees with their exact statements and axioms, and
//! the lock that pins every byte a routed model runs or loads, by hub commit,
//! package integrity and SHA-256, cut into pieces no larger than one served
//! object may be.

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

/// Every string value that follows `"key": "` in `text`, in order.
fn strings<'a>(text: &'a str, key: &str) -> Vec<&'a str> {
    text.split(&format!("\"{key}\": \""))
        .skip(1)
        .map(|rest| rest.split('"').next().unwrap_or_default())
        .collect()
}

fn is_fingerprint(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256-")
        && value[7..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// What is wrong with the models lock: a file not cut into pieces within the
/// limit, pieces that do not add up to their file, a name that is not a
/// SHA-256 fingerprint, a model not pinned to a hub commit, or a runtime not
/// pinned by version and registry integrity.
fn lock_problems(lock: &str) -> Vec<String> {
    let mut problems = Vec::new();
    if numbers(lock, "limitBytes") != [16_777_216] {
        problems.push("limitBytes is not 16 MiB".to_string());
    }
    let cut = numbers(lock, "pieceBytes").first().copied().unwrap_or(0);
    if cut == 0 || cut > 16_777_216 {
        problems.push(format!("pieceBytes {cut} is not within the limit"));
    }
    let files: Vec<&str> = lock.split("\"pieces\": [").collect();
    if files.len() < 2 {
        problems.push("no file is cut into pieces".to_string());
    }
    for pair in files.windows(2) {
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
    for value in strings(lock, "fingerprint") {
        if !is_fingerprint(value) {
            problems.push(format!("{value} is not a SHA-256 fingerprint"));
        }
    }
    for revision in strings(lock, "revision") {
        if revision.len() != 40 || !revision.bytes().all(|b| b.is_ascii_hexdigit()) {
            problems.push(format!(
                "a model's revision `{revision}` is not a pinned commit"
            ));
        }
    }
    if strings(lock, "revision").is_empty() {
        problems.push("no model is pinned to a hub commit".to_string());
    }
    let runtimes = strings(lock, "version").len();
    let integrity = strings(lock, "integrity");
    if runtimes == 0
        || integrity.len() != runtimes
        || !integrity.iter().all(|i| i.starts_with("sha512-"))
    {
        problems.push("every runtime package needs its sha512 registry integrity".to_string());
    }
    problems
}

/// `MD-01`: A language or reasoning model routed into the Prism runs in the browser only when the proved Prism Models decision says run: pinned by hub commit and SHA-256, in a format with a locked runtime, granted by the owner, and not halted; its answer is shown only through R4's routed mode and the Boundary
#[test]
fn models_md_01() {
    let model = read("app/src/PrismModels.lex.tex");
    let proofs = read("app/src/PrismModelsProofs.lex.tex");
    for text in [&model, &proofs] {
        assert!(
            !text.contains("Classical.choice"),
            "MD-01: the Prism Models decision must not rest on Classical.choice"
        );
    }
    assert!(
        !model.contains("name: application,") && !model.contains("TextApplication"),
        "MD-01: PrismModels is a library of the Prism, not a second application root"
    );
    assert!(
        declaration(&model, "modelsDispatch")
            .contains("(modelsEncodeAnswer (modelsJudge request))"),
        "MD-01: the answer must be decided by the judge the guarantees are about"
    );
    for n in 1..=9 {
        let theorem = declaration(&proofs, &format!("modelsInv00{n}Holds"));
        assert!(
            theorem.contains("parameters: [request : PrismModels::ModelsRequest],")
                && theorem.contains(&format!(
                    "statement: ((modelsBreaksInv00{n} request) = false),"
                ))
                && theorem.contains("axioms: [Quot.sound, propext]"),
            "MD-01: guarantee {n} changed its statement or axioms:\n{theorem}"
        );
        assert!(
            declaration(&proofs, &format!("modelsBreaksInv00{n}"))
                .contains("(PrismModels::modelsJudge request)"),
            "MD-01: guarantee {n} must be about the judge"
        );
    }
    assert!(
        proofs.find("modelsInv010Holds").is_none(),
        "MD-01: the register counts nine guarantees"
    );
    // INV-001 and INV-005: never run while halted, never run a model the owner did not grant.
    assert!(declaration(&proofs, "modelsBreaksInv001").contains(
        "((project request halted) =? (PrismModels::modelsHaltedYes))) && ((PrismModels::modelsJudge request) =? (PrismModels::modelsAnswerRun))"
    ));
    assert!(declaration(&proofs, "modelsBreaksInv005").contains(
        "((project request route) =? (PrismModels::modelsRouteUngranted))) && ((PrismModels::modelsJudge request) =? (PrismModels::modelsAnswerRun))"
    ));
    let project = read("app/lexlean.toml");
    for entry in ["src/PrismModels.lex.tex", "src/PrismModelsProofs.lex.tex"] {
        assert!(
            project.contains(&format!("\"{entry}\"")),
            "MD-01: {entry} is not an entrypoint"
        );
    }
    assert!(
        read("tools/prism_root.py").contains("(\"model\", \"PrismModels\", \"modelsDispatch\")"),
        "MD-01: the Prism root must route the model facet"
    );

    let lock = read("site/models/models.lock.json");
    let problems = lock_problems(&lock);
    assert!(problems.is_empty(), "MD-01:\n{}", problems.join("\n"));

    // The browser side asks the decision, never decides, and the worker serves only locked bytes.
    let adapter = read("site/models/models.mjs");
    assert!(
        adapter.contains("throw new Refusal(\"NoDecision\")")
            && adapter.contains("if (decision.outcome !== \"run\") return decision;")
            && adapter.contains("throw new Refusal(\"ModelMayNotRun\""),
        "MD-01: models.mjs must load and run only on the decision's run"
    );
    let worker = read("site/models/model-worker.mjs");
    assert!(
        worker.contains(
            "self.fetch = () => Promise.reject(new Error(\"NetworkClosedInModelWorker\"));"
        ) && worker.contains("statusText: \"NotLocked\""),
        "MD-01: the model worker must close the network and serve only locked bytes"
    );

    // Planted defects: the checker refuses an unpinned revision, an oversized
    // piece, a lost byte, an unpinned fingerprint and a runtime without integrity.
    let rev = strings(&lock, "revision")[0];
    assert!(!lock_problems(&lock.replacen(rev, "main", 1)).is_empty());
    let oversized = lock.replacen("\"bytes\": 8388608", "\"bytes\": 16777217", 1);
    assert!(!lock_problems(&oversized).is_empty());
    let fp = strings(&lock, "fingerprint")[0];
    assert!(!lock_problems(&lock.replacen(fp, &fp.to_uppercase(), 1)).is_empty());
    let integrity = strings(&lock, "integrity")[0];
    assert!(!lock_problems(&lock.replacen(integrity, "none", 1)).is_empty());
    let whole = lock.replacen("\"pieceBytes\": 8388608", "\"pieceBytes\": 67108864", 1);
    assert!(!lock_problems(&whole).is_empty());
}
