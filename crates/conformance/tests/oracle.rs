//! The `oracle` suite: `features/suites/oracle.feature`.
//!
//! The behaviour runs in `pages.yml` with every `*.test.mjs`:
//! `test/oracle/read.test.mjs` re-derives the corpus and the authorities from
//! the pinned sources and holds the Prism's reading to them. This test holds
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

/// `OR-01`: Every example of each specification the oracle pins by checksum, kept only where its addresses are at documentation domains, is read by the Prism as a reference reader written to that specification's own grammar reads it, beyond a debt list that only shrinks; the corpus is re-derived from the pinned sources on every run, and each pinned source is a cited authority whose evidence is this ID
#[test]
fn oracle_or_01() {
    // The generator and its pinning (tools/oracle/pin.py).
    let generator = read("tools/oracle/gen.py") + &read("tools/oracle/pin.py");
    for needle in [
        "not the pinned",
        "def documentation_only",
        "model/authorities.toml",
        "is stale",
    ] {
        assert!(
            generator.contains(needle),
            "OR-01: gen.py must contain `{needle}`"
        );
    }
    let test = read("test/oracle/read.test.mjs");
    for needle in ["\"--check\"", "spec.debt", "now read right"] {
        assert!(
            test.contains(needle),
            "OR-01: read.test.mjs must contain `{needle}`"
        );
    }
    let spec = read("app/specs/oracle/spec.json");
    let authorities = read("model/authorities.toml");
    // The calendar's pinned registry (app/specs/calendar/spec.json) is cited too.
    let calendar = read("app/specs/calendar/spec.json");
    let pinned = spec.matches("\"sha256\"").count() + calendar.matches("\"registry\": {").count();
    assert!(pinned > 0, "OR-01: the oracle pins at least one source");
    assert_eq!(
        authorities.matches("realized_by = [\"OR-01\"]").count()
            + authorities.matches("realized_by = [\"WP-01\"]").count(),
        pinned,
        "OR-01: every pinned source is a cited authority, realized by OR-01 (an example source) or WP-01 (a classification)"
    );
    assert!(
        read(".github/workflows/pages.yml").contains("suites=(test/**/*.test.mjs)"),
        "OR-01: the gates run every *.test.mjs, test/oracle among them"
    );
}

/// `VC-01`: vCard is read as RFC 6350 defines it: the page's property table is derived from the RFC's own ABNF, every entry of IANA's vCard Elements registry is implemented and exercised by an example line its RFC gives (or one derived from an RFC's own example of a property it applies to), RFC 6350 and each RFC extending it being pinned, the Prism reads each example line as a reference reader written to RFC 6350 sections 3.3 and 3.4 reads it, and an entry neither met nor in a debt that only shrinks fails the build
#[test]
fn oracle_vc_01() {
    let generator = read("tools/oracle/vcard.py");
    for needle in [
        "not the pinned",
        "def documentation_only",
        "neither met nor in debt",
        "is now implemented and exercised",
        "is stale",
    ] {
        assert!(
            generator.contains(needle),
            "VC-01: vcard.py must contain `{needle}`"
        );
    }
    let test = read("test/oracle/vcard.test.mjs");
    for needle in ["\"--check\"", "spec.debt", "planted"] {
        assert!(
            test.contains(needle),
            "VC-01: vcard.test.mjs must contain `{needle}`"
        );
    }
    assert!(
        read("model/authorities.toml").contains("realized_by = [\"VC-01\"]"),
        "VC-01: the vCard registry is a cited authority realized by VC-01"
    );
}
