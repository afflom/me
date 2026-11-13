//! The `device` suite: one test per scenario in `features/suites/device.feature`.
//!
//! The Lean kernel proves the guarantees when `just vv` runs `prismpm verify`
//! on `app/`. These tests hold the claims fixed (every guarantee present, its
//! axioms exactly `[Quot.sound, propext]`), run the compiled guests over every
//! request in Node (`site/device/device.test.mjs`), and check that the page's
//! policy and the shipped guest are the ones the model names.

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

/// Every theorem in a proofs module: `n` of them, each `breaksInvNNN = false`
/// over every request, each resting on exactly Quot.sound and propext.
fn proved(proofs: &str, module: &str, prefix: &str, request: &str, n: usize) {
    let text = read(proofs);
    for i in 1..=n {
        let name = format!("{prefix}Inv{i:03}Holds");
        let start = text
            .find(&format!("  name: {name},\n"))
            .unwrap_or_else(|| panic!("{proofs}: {name} is missing"));
        let body = &text[start..start + text[start..].find("\n}\n").expect("closed")];
        assert!(
            body.contains(&format!("parameters: [request : {module}::{request}],"))
                && body.contains(&format!(
                    "statement: (({prefix}BreaksInv{i:03} request) = false),"
                ))
                && body.contains("axioms: [Quot.sound, propext]"),
            "{name} changed its statement or its axioms:\n{body}"
        );
    }
    assert!(
        !text.contains(&format!("{prefix}Inv{:03}Holds", n + 1)),
        "{proofs} has more guarantees than the scenario names"
    );
    assert!(
        !text.contains("Classical.choice"),
        "{proofs} uses Classical.choice"
    );
    let toml = read("app/lexlean.toml");
    assert!(
        toml.contains(&format!("\"src/{module}.lex.tex\""))
            && toml.contains(&format!("\"src/{module}Proofs.lex.tex\"")),
        "{module} and its proofs are lexlean entrypoints"
    );
}

/// The Node suite over the real guest and a test double for the device.
fn node_suite() {
    let result = Command::new("node")
        .arg("site/device/device.test.mjs")
        .current_dir(root())
        .output()
        .expect("Node runs the device suite");
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

/// `DV-01`: The page lists or reads on the owner's device only when PrismFolder answers read, which it never does while halted, without the browser's grant, for a write, for a file that is not mail, calendar or contacts, or for one too large to read at once
#[test]
fn device_dv_01() {
    proved(
        "app/src/PrismFolderProofs.lex.tex",
        "PrismFolder",
        "folder",
        "FolderRequest",
        7,
    );
    let page = read("site/device/device.mjs");
    assert_eq!(
        page.matches("decide(`").count(),
        1,
        "DV-01: one place asks PrismFolder"
    );
    assert!(
        page.contains("!== 'read') { tally.skip += 1; return; }")
            && page.contains("if (answer !== 'read') { tally[answer === 'skip' ? 'skip' : 'refuse'] += 1; return; }")
            && page.contains("if ((await ask(grant, 'other', 'list', 'small')) !== 'read') return;"),
        "DV-01: every list and every read acts only on read"
    );
    let root = read("tools/prism_root.py");
    assert!(
        root.contains("(\"folder\", \"PrismFolder\", \"folderDispatch\")"),
        "DV-01: the Prism root routes folder requests to PrismFolder"
    );
    node_suite();
}

/// `DV-02`: Mail, calendar and contacts read from the owner's device reach only the browser vault, through the detectors and the Boundary, from a folder opened read-only or files the owner picked or dropped
#[test]
fn device_dv_02() {
    let page = read("site/device/device.mjs");
    assert!(
        page.contains("picker({ id: 'prism-device', mode: 'read' })")
            && !page.contains("readwrite' })")
            && !page.contains("createWritable")
            && !page.contains("fetch("),
        "DV-02: the folder is opened read-only, nothing is written to it, and nothing is sent anywhere"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains(
            "decide: (rest) => line(`folder ${rest}`), ingest: ingestInto({ vault }), halted"
        ),
        "DV-02: the page asks the Prism root and keeps each item through the vault"
    );
    let surface = read("app/specs/surface/spec.json");
    assert!(
        surface.contains("{\"key\": \"device\", \"viewpoint\": \"person\", \"kind\": \"detail\", \"group\": \"sources\", \"name\": \"This device\", \"source\": \"file\"}"),
        "DV-02: the source is one row in the person's settings sheet"
    );
    node_suite();
}

/// `DV-03`: The page uses each surface the browser reports for the owner's content only as PrismHost answers: every reported surface is used or offered, nothing is used while halted, a paste, drop, pick or contact list only on the owner's act, a folder only on the owner's act or a grant the browser keeps, and a live account on another origin is named sealed
#[test]
fn device_dv_03() {
    proved(
        "app/src/PrismHostProofs.lex.tex",
        "PrismHost",
        "host",
        "HostRequest",
        11,
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("(await d.ask({ act: { [surface]: \"owner\" } }))[surface] === \"use\"")
            && card.contains("busy(contacts, owner(\"contacts\"),")
            && card.contains("busy(files, owner(\"files\"),")
            && card.contains("busy(addFolder, owner(\"folder\"),"),
        "DV-03: a press, a pick or a contact list is used only on PrismHost's use for the owner's act"
    );
    for surface in ["paste", "drop"] {
        assert!(
            card.contains(&format!("(await d.ask({{ act: {{ {surface}: \"owner\" }} }})).{surface} !== \"use\") return;")),
            "DV-03: a {surface} is used only on PrismHost's use for the owner's act"
        );
    }
    assert!(
        card.contains("const plan = await d.ask({ grant: { folder: kept ? \"kept\" : \"none\", extension: extensionGrant() } });")
            && card.contains("if (plan.folder === \"use\") {\n      const t = await d.source.readFolders();"),
        "DV-03: a folder is re-read on a visit only on PrismHost's use for a kept grant"
    );
    assert!(
        card.contains("host.plan({ decide: (rest) => line(`host ${rest}`), halted, ...more })")
            && card.contains("lanes: host.lanes()"),
        "DV-03: the page asks the Prism root's host facet and keeps items on the host rule's lanes"
    );
    let host = read("site/device/host.mjs");
    assert!(
        host.contains("export const HOST = { coreLimit: 16, workersPerGiB: 2, unreportedGiB: 2 };"),
        "DV-03: the host rule is uorc's"
    );
    let root = read("tools/prism_root.py");
    assert!(
        root.contains("(\"host\", \"PrismHost\", \"hostDispatch\")"),
        "DV-03: the Prism root routes host requests to PrismHost"
    );
    node_suite();
}

/// `DV-04`: Live Gmail and Google Calendar reach the Prism only through the extension the owner installed, written by the page for its own address: it reads by GET with the owner's own sign-in, answers only that Prism page, reads nothing while halted, and each item it hands over is kept only through PrismHost, PrismFolder, the detectors and the vault
#[test]
fn device_dv_04() {
    let background = read("site/extension/background.js");
    assert!(
        background.contains("const INIT = Object.freeze({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow' });")
            && background.matches("fetchImpl(").count() == 3
            && background.matches(", INIT)").count() == 2
            && background.contains("fetchImpl(chrome.runtime.getURL('services.json'), { method: 'GET' })")
            && background.contains("if (!own(service, url)) continue;")
            && !background.contains("POST"),
        "DV-04: every request the extension makes is the one GET"
    );
    assert!(
        background.contains("if (message?.prism === 'pull' && from.startsWith(PRISM)) {")
            && background.contains("if (state.halted !== 'no') return 0;")
            && background.contains("if (halted !== 'no') return { items: [] };"),
        "DV-04: only the Prism page pulls, and nothing is read while halted"
    );
    let manifest = read("site/extension/manifest.json");
    assert!(
        manifest.contains("\"host_permissions\": \"__ORIGINS__\"")
            && manifest
                .contains("\"permissions\": [\"storage\", \"unlimitedStorage\", \"alarms\"]")
            && manifest.contains("\"matches\": [\"__PRISM__*\"]"),
        "DV-04: the extension reaches only the declared origins, and is written for one Prism page"
    );
    let card = read("site/card.mjs");
    assert!(
        card.contains("if (plan.extension === \"use\") {")
            && card.contains("for (const item of await pull(window, { halted: halted() })) {")
            && card.contains("if ((await line(`source ${item.service} ${item.route} read ${halted()}`)) === \"read\") items.push(item);"),
        "DV-04: the page pulls only on PrismHost's use and keeps each item through the device source"
    );
    let device = read("site/device/device.mjs");
    assert!(
        device.contains("const format = formatOfText(text);"),
        "DV-04: an item is read by its own first bytes, never by the extension's claim"
    );
    node_suite();
}

/// `DV-05`: Every service the owner uses is a declaration in the model, read only as PrismSource answers: by what its web app shows the owner, by its own pages with the owner's own sign-in, or by its own data download; never while halted, never written to, never undeclared, and never through a private interface
#[test]
fn device_dv_05() {
    proved(
        "app/src/PrismSourceProofs.lex.tex",
        "PrismSource",
        "source",
        "SourceRequest",
        6,
    );
    let declared = read("app/specs/source/services.json");
    assert_eq!(
        declared,
        read("site/extension/services.json"),
        "DV-05: the extension carries exactly the model's declarations"
    );
    for service in ["gmail", "calendar", "discord", "whatsapp", "linkedin"] {
        assert!(
            declared.contains(&format!("\"key\": \"{service}\"")),
            "DV-05: {service} is declared"
        );
    }
    let gen = Command::new("python3")
        .args(["-I", "tools/source/gen.py", "--check"])
        .current_dir(root())
        .output()
        .expect("python3 runs the declarations check");
    assert!(
        gen.status.success(),
        "DV-05: the page's and the extension's declarations are current: {}",
        String::from_utf8_lossy(&gen.stderr)
    );
    let pack = read("site/device/extension.mjs");
    assert!(
        pack.contains(".replace('\"__ORIGINS__\"', JSON.stringify(origins))"),
        "DV-05: the extension's permissions are written from the declarations"
    );
    let root = read("tools/prism_root.py");
    assert!(
        root.contains("(\"source\", \"PrismSource\", \"sourceDispatch\")"),
        "DV-05: the Prism root routes source requests to PrismSource"
    );
    node_suite();
}
