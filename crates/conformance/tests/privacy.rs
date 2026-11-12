//! The `privacy` suite: one test per scenario in `features/suites/privacy.feature`.

use std::path::PathBuf;

use repo_conformance::privacy::{scan_dir, scan_text, scan_tracked, Kind};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// Luhn-completes `body` so the planted card number is valid without a valid
/// card number ever being written in this file.
fn luhn_complete(body: &str) -> String {
    (0..10)
        .map(|d| format!("{body}{d}"))
        .find(|n| {
            let sum: u32 = n
                .bytes()
                .rev()
                .enumerate()
                .map(|(i, b)| {
                    let d = u32::from(b - b'0');
                    if i % 2 == 1 {
                        (d * 2) / 10 + (d * 2) % 10
                    } else {
                        d
                    }
                })
                .sum();
            sum.is_multiple_of(10)
        })
        .expect("one check digit completes any body")
}

/// `PV-01`: Neither the tracked tree nor the built page holds personal data: every email address is at a reserved domain, and no phone, payment card or national ID number appears
#[test]
fn privacy_pv_01() {
    // The tracked tree is clean.
    let found = scan_tracked(&root()).expect("git lists the tracked tree");
    let listed: Vec<String> = found.iter().map(ToString::to_string).collect();
    assert!(found.is_empty(), "PV-01:\n{}", listed.join("\n"));

    // Synthetic values pass. Each is assembled at run time so that no literal in
    // this file is one the gate would refuse.
    let at = '@';
    let clean = [
        format!("owner{at}example.com"),
        format!("dev{at}mail.example.org"),
        format!("x{at}host.invalid"),
        "+1 303 555 0142".to_string(),
        "2026-11-12, 1762516800000, v4.32.1, @types/node".to_string(),
        "000-12-3456 and 900-12-3456".to_string(),
    ];
    for line in &clean {
        assert!(
            scan_text("clean", line, &[]).is_empty(),
            "PV-01 refused a synthetic value"
        );
    }

    // A planted value of each kind is refused, and the finding names the place
    // and the kind but never the value.
    let card = luhn_complete("411111111111111");
    let planted = [
        (format!("reach me at someone{at}gmail.com"), Kind::Email),
        (format!("call +1 303 555 {}", 2 * 4321), Kind::Phone),
        (format!("card {card}"), Kind::Card),
        (format!("ssn {}-{}-{}", 123, 45, 6789), Kind::NationalId),
    ];
    for (line, kind) in &planted {
        let found = scan_text("planted.md", line, &[]);
        assert_eq!(
            found.iter().map(|f| f.kind).collect::<Vec<_>>(),
            vec![*kind],
            "PV-01 missed a planted {kind}"
        );
        let shown = found[0].to_string();
        assert_eq!(shown, format!("planted.md:1: {kind} (PV-01)"));
    }

    // The owner's local deny terms are refused, case-insensitively.
    let deny = vec!["placeholder owner".to_string()];
    let found = scan_text("page.html", "<h1>Placeholder Owner</h1>", &deny);
    assert_eq!(
        found.iter().map(|f| f.kind).collect::<Vec<_>>(),
        vec![Kind::Denied]
    );

    // The same gate reads an assembled page directory.
    let dir = std::env::temp_dir().join(format!("pv-01-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("assets")).expect("a temporary page");
    std::fs::write(dir.join("index.html"), "<p>the owner</p>\n").expect("a page");
    std::fs::write(
        dir.join("assets").join("data.json"),
        format!("{{\"to\": \"someone{at}gmail.com\"}}\n"),
    )
    .expect("a planted asset");
    // R4's pieces are skipped only when the page's R4 lock pins them by
    // fingerprint (R4-01); an unpinned file beside them is still read.
    let pinned = "ab".repeat(32);
    let unpinned = "cd".repeat(32);
    std::fs::create_dir_all(dir.join("r4").join("objects")).expect("a temporary r4 folder");
    std::fs::write(
        dir.join("r4").join("r4.lock.json"),
        format!("{{\"pieces\": [{{\"fingerprint\": \"sha256-{pinned}\", \"bytes\": 1}}]}}\n"),
    )
    .expect("a lock");
    for hex in [&pinned, &unpinned] {
        std::fs::write(
            dir.join("r4").join("objects").join(format!("{hex}.gz")),
            format!("someone{at}gmail.com\n"),
        )
        .expect("a piece");
    }
    let found = scan_dir(&root(), &dir).expect("the page is read");
    std::fs::remove_dir_all(&dir).expect("the temporary page is removed");
    assert_eq!(found.len(), 2, "PV-01 missed a planted page asset");
    assert!(found.iter().all(|f| f.kind == Kind::Email));
    assert!(found.iter().any(|f| f.path.ends_with("data.json")));
    assert!(
        found
            .iter()
            .any(|f| f.path.ends_with(&format!("{unpinned}.gz"))),
        "PV-01 skipped a file the R4 lock does not pin"
    );
}
