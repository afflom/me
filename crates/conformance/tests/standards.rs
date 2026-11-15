//! The `standards` suite: `features/suites/standards.feature`.
//!
//! The behaviour runs in `pages.yml` before the proof: `tools/standards/gate.py
//! --check` re-derives every requirement from the pinned texts, and on a pull
//! request `--base origin/main` holds the debt to only shrink. This test holds
//! the wiring fixed.

use std::path::PathBuf;

fn read(path: &str) -> String {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    std::fs::read_to_string(root.join(path)).expect(path)
}

/// `ST-01`: Every part of the Prism answers to a registered standard or says why none applies, and every normative requirement of each standard whose text is pinned by checksum, extracted mechanically from that text, is enforced by a suite that reaches a part it governs, beyond a debt list that only shrinks; a standard whose text is not pinned says why
#[test]
fn standards_st_01() {
    let gate = read("tools/standards/gate.py");
    for needle in [
        "not the pinned",
        "is not what the pinned standards give",
        "neither 'withheld' nor 'unpinned' says why",
        "answers to no registered standard",
        "reaches no part that",
        "is enforced by no suite and is not in the debt",
        "the debt only shrinks",
        "the list only shrinks",
    ] {
        assert!(
            gate.contains(needle),
            "ST-01: gate.py must contain `{needle}`"
        );
    }
    let pages = read(".github/workflows/pages.yml");
    for needle in [
        "python3 -I tools/standards/gate.py --check",
        "--base \"origin/$BASE\"",
    ] {
        assert!(
            pages.contains(needle),
            "ST-01: pages.yml must run `{needle}`"
        );
    }
    let spec = read("app/specs/standards/spec.json");
    assert!(
        spec.contains("\"standards\"") && spec.contains("\"unassigned\""),
        "ST-01: the register lists its standards and its unassigned parts"
    );
}
