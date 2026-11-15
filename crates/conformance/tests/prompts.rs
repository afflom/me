//! The `prompts` suite: every decision the Prism makes has its full Prism model.
//!
//! app/prompts/set.json is the Prism's prompt set. `tools/prompts/gen.py`
//! writes each listed decision's prompt from its specification and runs the
//! builder vendored at tools/builder, which writes the decision's model and
//! constructive proofs and the facet modules (Architecture, Design, Features,
//! Quality, Security, Compliance) for them all. `BS-01` fails when any of that
//! is stale, when a decision spec in app/specs is neither built nor awaiting the builder
//! with a reason, or when that list grows.

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

/// The keys of the JSON object that follows `"key": {` in `text` (none for `{}`).
fn object_keys(text: &str, key: &str) -> Vec<String> {
    let start = text
        .find(&format!("\"{key}\": {{"))
        .unwrap_or_else(|| panic!("set.json has no {key}"));
    if text[start..].starts_with(&format!("\"{key}\": {{}}")) {
        return Vec::new();
    }
    let body = &text[start..start + text[start..].find("\n  }").expect("closed")];
    body.lines()
        .skip(1)
        .filter_map(|l| l.trim().strip_prefix('"'))
        .filter_map(|l| l.split_once("\":").map(|(k, _)| k.to_string()))
        .collect()
}

/// The strings of the JSON array that follows `"key": [` in `text`.
fn array_items(text: &str, key: &str) -> Vec<String> {
    let start = text
        .find(&format!("\"{key}\": ["))
        .unwrap_or_else(|| panic!("set.json has no {key}"));
    let body = &text[start..start + text[start..].find(']').expect("closed")];
    body.split('"')
        .skip(3)
        .step_by(2)
        .map(|s| s.trim_end_matches(".prompt.json").to_string())
        .collect()
}

/// The decisions still awaiting the builder: the list may only shrink, and it is empty.
const AWAITING_AT_MOST: [&str; 0] = [];

/// `BS-01`: every decision spec is built with its full model by the builder, or awaiting the builder with a reason; the awaiting list only shrinks; every generated file is current
#[test]
fn prompts_bs_01() {
    let set = read("app/prompts/set.json");
    let built = array_items(&set, "prompts");
    let awaiting = object_keys(&set, "awaiting");
    assert!(!built.is_empty(), "the set builds at least one decision");
    for p in &awaiting {
        assert!(
            AWAITING_AT_MOST.contains(&p.as_str()),
            "{p} was added to awaiting: a decision leaves the builder only by a change to this gate"
        );
        assert!(!built.contains(p), "{p} is both built and awaiting");
    }
    let mut decisions = 0;
    for entry in std::fs::read_dir(root().join("app/specs")).expect("app/specs") {
        let dir = entry.expect("entry").path();
        let name = dir.file_name().unwrap().to_string_lossy().to_string();
        let Ok(spec) = std::fs::read_to_string(dir.join("spec.json")) else {
            continue;
        };
        if !spec.contains("\"fields\":") {
            continue;
        }
        decisions += 1;
        assert!(
            built.contains(&name) || awaiting.contains(&name),
            "app/specs/{name} decides but is neither in app/prompts/set.json nor awaiting there"
        );
    }
    assert_eq!(
        decisions,
        built.len() + awaiting.len(),
        "every built or awaiting name is a decision spec in app/specs"
    );
    let out = Command::new("python3")
        .args(["-I", "tools/prompts/gen.py", "--check"])
        .current_dir(root())
        .output()
        .expect("python3 runs");
    assert!(
        out.status.success(),
        "the prompt set's generated files are stale:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}
