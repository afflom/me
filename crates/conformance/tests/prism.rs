//! The `prism` suite: one test per scenario in `features/suites/prism.feature`.
//!
//! The Lean kernel checks the proofs when `just vv` runs `prismpm verify` on
//! `app/`. These tests hold fixed what those proofs are about: each theorem's
//! exact statement and axioms, and that the application's answer is decided by
//! the functions the theorems name. A weakened statement, a dropped guarantee,
//! an extra axiom or an answer decided some other way would still verify, and
//! would no longer be the claim the register makes.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn model(file: &str) -> String {
    std::fs::read_to_string(root().join("app/src").join(file))
        .unwrap_or_else(|error| panic!("app/src/{file}: {error}"))
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

/// The axiom policy: classical choice is never admitted.
const AXIOMS: &str = "axioms: [Quot.sound, propext]";

/// Every guarantee, `count` of them, of a facet's proofs module is a theorem that its
/// `breaksInvNNN` check is false for every request, and that check asks
/// about the facet's own `judge`.
fn guarantees(id: &str, module: &str, kind: &str, count: usize) {
    let prefix = format!("{}{}", kind[..1].to_lowercase(), &kind[1..]);
    let proofs = model(&format!("{module}Proofs.lex.tex"));
    for n in 1..=count {
        let theorem = declaration(&proofs, &format!("inv{n:03}Holds"));
        assert!(
            theorem.contains(&format!("parameters: [request : {module}::{kind}Request],"))
                && theorem.contains(&format!("statement: ((breaksInv{n:03} request) = false),"))
                && theorem.contains(AXIOMS),
            "{id}: inv{n:03}Holds must prove breaksInv{n:03} false for every request with {AXIOMS}:\n{theorem}"
        );
        let breaks = declaration(&proofs, &format!("breaksInv{n:03}"));
        assert!(
            breaks.contains(&format!("({module}::{prefix}Judge request)")),
            "{id}: breaksInv{n:03} must be about {module}::{prefix}Judge:\n{breaks}"
        );
    }
    assert!(
        !proofs.contains(&format!("inv{:03}Holds", count + 1)),
        "{id}: {module} has more guarantees than the register counts"
    );
    let facet = model(&format!("{module}.lex.tex"));
    let dispatch = declaration(&facet, &format!("{prefix}Dispatch"));
    assert!(
        dispatch.contains(&format!("({prefix}EncodeAnswer ({prefix}Judge request))")),
        "{id}: {module}'s answer must be decided by the judge its guarantees are about:\n{dispatch}"
    );
    assert!(
        !facet.contains("name: application,"),
        "{id}: {module} is a library of the Prism, not a second application root"
    );
}

/// `PM-01`: The Prism answers a request naming a known facet with exactly that facet's decision of the rest, and refuses every other request
#[test]
fn prism_pm_01() {
    let prism = model("Prism.lex.tex");
    let proofs = model("PrismProofs.lex.tex");
    let root = model("../../tools/prism_root.py");
    let facets = root
        .split("FACETS = [")
        .nth(1)
        .and_then(|rest| rest.split("\n]").next())
        .expect("FACETS");
    for row in facets.lines().filter(|line| line.contains('(')) {
        let field: Vec<&str> = row.split('"').collect();
        let held = if declaration(&prism, "firstRoute").contains(&format!(
            "(facet{}{})",
            field[1][..1].to_uppercase(),
            &field[1][1..]
        )) {
            let same = format!("((Prism::firstRoute (Prism::facet{0}) rest) = (Prism::route (Prism::facet{0}) rest)),", format!("{}{}", field[1][..1].to_uppercase(), &field[1][1..]));
            declaration(
                &proofs,
                &format!("first{}{}", field[1][..1].to_uppercase(), &field[1][1..]),
            )
            .contains(&same)
        } else {
            let guest = model(&format!("../specs/guests/later/later-{}.json", field[1]));
            guest.contains(&format!("\"dispatch\": \"{}::{}\"", field[3], field[5]))
                && guest.contains(&format!("\"as\": \"{}\"", field[1]))
        };
        assert!(
            held,
            "PM-01: {} is answered on a first visit as the route answers it, or by its own guest",
            field[1]
        );
        let (facet, module, dispatch) = (
            format!("{}{}", field[1][..1].to_uppercase(), &field[1][1..]),
            field[3],
            field[5],
        );
        let theorem = declaration(&proofs, &format!("routes{facet}"));
        assert!(
            theorem.contains(&format!(
                "statement: ((Prism::route (Prism::facet{facet}) rest) = ({module}::{dispatch} rest)),"
            )) && theorem.contains(AXIOMS),
            "PM-01: routes{facet} must prove the {facet} facet answers with {module}::{dispatch}:\n{theorem}"
        );
    }
    let unknown = declaration(&proofs, "refusesUnknownFacet");
    assert!(
        unknown
            .contains("statement: ((Prism::route (Prism::facetUnknown) rest) = (Prism::refusal)),")
            && unknown.contains(AXIOMS),
        "PM-01: an unknown facet must be refused:\n{unknown}"
    );
    let dispatch = declaration(&prism, "dispatch");
    assert!(
        dispatch.contains("(firstRoute (facetOf value) (restOf value))"),
        "PM-01: the application's answer must be decided by firstRoute:\n{dispatch}"
    );
    let application = declaration(&prism, "application");
    assert!(
        application.contains("entryRoot := \"Me.Prism.dispatch\""),
        "PM-01: the application's entry is the router"
    );
}

/// `PM-02`: The Boundary denies every move while halted and every move to GitHub or the hosted verifier, never allows detected, restricted or identifying data out, and never sends outbound without the owner's approval
#[test]
fn prism_pm_02() {
    guarantees("PM-02", "PrismBoundary", "PrismBoundary", 7);
}

/// `PM-03`: Learning confirms or rejects a belief only on the owner's signal, holds a confirmed or rejected belief against every other signal, and never raises a weight above 15 or lowers it below 1
#[test]
fn prism_pm_03() {
    guarantees("PM-03", "PrismLearning", "PrismLearning", 8);
}

/// `PM-04`: Chronology never names an Allen relation that the two intervals' endpoints contradict, and never calls two well-formed intervals malformed
#[test]
fn prism_pm_04() {
    guarantees("PM-04", "PrismChronology", "PrismChronology", 8);
}
