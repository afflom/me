//! The `page` suite: `features/suites/page.feature`.
//!
//! The behaviour is exercised in headless Chromium against the assembled page
//! by `test/page/card.test.mjs` in `pages.yml`. This test holds the wiring
//! fixed: every decision the page acts on comes from the verified app guest,
//! never from the page's own code.

use std::path::PathBuf;

/// `PG-01`: The page keeps, reads and answers only through the verified app: a note is kept at its domain's floor only when the Boundary and the vault allow it, nothing is kept while halted, and an outbound act is only drafted until the owner's Send
#[test]
fn page_pg_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let card = std::fs::read_to_string(root.join("site/card.mjs")).expect("site/card.mjs");
    for (wiring, why) in [
        (
            "decoder.decode(await app.dispatch(encoder.encode(text)))",
            "every question goes to the verified root guest",
        ),
        (
            "openVault({ decide: routerDecide(line), halted, objects })",
            "the vault's decisions are the root's, it sees the halt switch, and it keeps values as uorc archives",
        ),
        (
            "const mapped = await route({ source: \"note\", values: { text }, line, halted });",
            "the R4 router's decisions are the root's router facet, and it sees the halt switch",
        ),
        (
            "const halted = () => (haltedNow ? \"yes\" : \"no\");",
            "the halt switch reaches the Boundary as its halted field",
        ),
    ] {
        assert!(
            card.contains(wiring),
            "PG-01: {why}: site/card.mjs must contain `{wiring}`"
        );
    }
    assert!(
        !card.contains("fetch(\"http") && !card.contains("fetch('http"),
        "PG-01: the page fetches nothing from another origin"
    );
    let test =
        std::fs::read_to_string(root.join("test/page/card.test.mjs")).expect("the browser test");
    for expected in [
        "settle(\"Kept\")",
        "settle(\"Paused\")",
        ".pr-go[data-place=\"health\"]').count(), 0",
        "settle(\"Refused\")",
        "settle(\"Ready to send\")",
    ] {
        assert!(
            test.contains(expected),
            "PG-01: the browser test must expect {expected}"
        );
    }
}

/// `PG-02`: The page is PrismSurface made visible: one place per owner view of the design model, showing that view's domains under its role, every act and setting in its modeled place, every visible word a name from the model, every list place fed by a source or an act, and every colour a tone of its modeled look read at its contrast
#[test]
fn page_pg_02() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect(path);

    // The surface's files are what app/specs/surface/spec.json makes, and the
    // generator refuses any visible word that is not a name.
    let check = std::process::Command::new("python3")
        .args(["-I", "tools/surface/gen.py", "--check"])
        .current_dir(&root)
        .output()
        .expect("python3 runs the surface generator");
    assert!(
        check.status.success(),
        "PG-02: the surface is stale or holds a word that is not a name: {}",
        String::from_utf8_lossy(&check.stderr)
    );

    // Every guarantee binding the surface to the design model is in the
    // proved project, by decide, so `prismpm verify` checks it in Lean.
    let proofs = read("app/src/PrismSurfaceProofs.lex.tex");
    for theorem in [
        "surfaceEveryOwnerViewPlaced",
        "surfacePlacesAreViews",
        "surfaceOneHome",
        "surfaceOneComposer",
        "surfaceOneSheet",
        "surfaceEverySettingInOneSection",
        "surfaceSectionsAreFewAndShort",
        "surfaceSetupIsShortAndWhole",
        "surfacePageIsThePersonsView",
        "surfaceMenuIsShort",
        "surfaceActsInTheirRoles",
        "surfaceNotesKeepTheFloor",
        "surfaceFloorsAreTheDesign",
        "surfaceEveryDomainNamed",
        "surfaceEveryRoleNamed",
        "surfaceEveryLabelNamed",
        "surfaceEverySourceOneSetting",
        "surfaceSettingsInGroups",
        "surfaceNoEmptyGroup",
        "surfaceEveryPairReads",
        "surfaceTonesAreColours",
        "surfaceTwoThemes",
        "surfaceEveryPlaceIsFed",
    ] {
        let at = proofs
            .find(&format!("name: {theorem},"))
            .unwrap_or_else(|| panic!("PG-02: {theorem} is not stated"));
        let body = &proofs[at..];
        let end = body.find("\n}").expect("a theorem block ends");
        assert!(
            body[..end].contains("parameters: [],") && body[..end].contains("proof: decide{}"),
            "PG-02: {theorem} must be closed and proved by decide"
        );
    }
    let project = read("app/lexlean.toml");
    for entry in ["src/PrismSurface.lex.tex", "src/PrismSurfaceProofs.lex.tex"] {
        assert!(
            project.contains(&format!("\"{entry}\"")),
            "PG-02: {entry} must be a proved entrypoint"
        );
    }

    // The page draws the model's words and no words of its own.
    let card = read("site/card.mjs");
    assert!(
        card.contains("from \"./surface/surface.mjs\""),
        "PG-02: the page reads its places and words from the surface model"
    );
    for literal in [
        "textContent: \"",
        "textContent = \"",
        "placeholder: \"",
        "say(\"",
        "name: \"",
    ] {
        let mut rest = card.as_str();
        while let Some(at) = rest.find(literal) {
            let after = &rest[at + literal.len()..];
            assert!(
                after.starts_with('"'),
                "PG-02: site/card.mjs writes its own word after `{literal}`"
            );
            rest = after;
        }
    }
}

/// `PG-03`: Every act on the page completes end to end: what the owner sends is the very event or message they reviewed and is kept in the place it left from at that domain's floor, every kept item opens to its words, and Ask draws on the kept items that share its words, never while halted, under the highest label it drew on
#[test]
fn page_pg_03() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect(path);
    let card = read("site/card.mjs");
    for (wiring, why) in [
        (
            "description: text, now: Date.now() }",
            "an event's stamp is fixed at Review, so the reviewed event is the sent event",
        ),
        (
            "await keepSent(place, act, done.out);",
            "what was delivered is kept in the place it left from",
        ),
        (
            "const label = LABELS[FLOORS[domain]].toLowerCase();\n    const result = await vault.put(encoder.encode(out.bytes)",
            "what was sent is kept as its exact bytes at its domain's floor",
        ),
        (
            "items: haltedNow ? [] : items",
            "Ask draws on nothing kept while halted",
        ),
    ] {
        assert!(
            card.contains(wiring),
            "PG-03: {why}: site/card.mjs must contain `{wiring}`"
        );
    }
    let answer = read("site/router/answer.mjs");
    for (wiring, why) in [
        (
            "used.reduce((at, item) => higher(at, item.label ?? \"confidential\"), \"confidential\")",
            "Ask's answer carries the highest label it drew on",
        ),
        (
            "from \"../coherence/sense.mjs\"",
            "Ask draws through the coherence registry, which never draws on a sealed item (CO-03)",
        ),
    ] {
        assert!(
            answer.contains(wiring),
            "PG-03: {why}: site/router/answer.mjs must contain `{wiring}`"
        );
    }
    let test = read("test/page/acts.test.mjs");
    for expected in ["Dentist checkup", "aria-expanded", ".pr-drawn", "#pr-halt"] {
        assert!(
            test.contains(expected),
            "PG-03: the browser test must exercise {expected}"
        );
    }
}

/// `VO-01`: The Prism answers a gesture in tone and colour from PrismSurface's voice: 5-limit just ratios within one octave, a loudness ceiling, a rest between answers, silent under Quiet, and nothing loaded before the owner's first gesture
#[test]
fn page_vo_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let read =
        |path: &str| std::fs::read_to_string(root.join(path)).unwrap_or_else(|_| panic!("{path}"));
    // The voice's numbers are the model's, each guarantee closed by decide.
    let proofs = read("app/src/PrismSurfaceProofs.lex.tex");
    for theorem in [
        "surfaceVoiceIsJust",
        "surfaceScaleIsOneOctave",
        "surfaceAnswersInTheScale",
        "surfaceVoiceHasRest",
        "surfaceVoiceIsHumane",
    ] {
        let at = proofs
            .find(&format!("name: {theorem},"))
            .unwrap_or_else(|| panic!("VO-01: {theorem} is not stated"));
        let body = &proofs[at..];
        let end = body.find("\n}").expect("a theorem block ends");
        assert!(
            body[..end].contains("parameters: []") && body[..end].contains("proof: decide{}"),
            "VO-01: {theorem} must be closed and proved by decide"
        );
    }
    let voice = read("site/voice.mjs");
    for (wiring, why) in [
        (
            "import { VOICE, WORDS } from \"./surface/surface.mjs\";",
            "every number is PrismSurface's",
        ),
        (
            "master.gain.value = VOICE.ceiling / 100;",
            "the ceiling is the model's",
        ),
        (
            "if (now - last < VOICE.refractory) return;",
            "a rest between answers",
        ),
        ("if (!quiet) sound(", "silent under Quiet"),
        (
            "onResonance((signal) => answer(signal.answer",
            "PrismResonance decides the answer",
        ),
    ] {
        assert!(voice.contains(wiring), "VO-01: {why} ({wiring})");
    }
    for number in ["220", "0.06", "Math.pow"] {
        assert!(
            !voice.contains(number),
            "VO-01: site/voice.mjs holds a number of its own ({number})"
        );
    }
    // Nothing of the voice loads before the owner's first gesture.
    let card = read("site/card.mjs");
    assert!(
        card.contains("addEventListener(\"pointerdown\", voice, { once: true, capture: true });")
            && card
                .contains("addEventListener(\"keydown\", voice, { once: true, capture: true });"),
        "VO-01: the voice loads on the owner's first gesture"
    );
    assert_eq!(
        card.matches("./voice.mjs").count(),
        1,
        "VO-01: the voice is imported once, lazily"
    );
    assert!(
        root.join("test/page/voice.test.mjs").exists(),
        "VO-01: the browser test exists"
    );
}
