//! Repository gates.
//!
//! `cargo xtask <task>`; `just vv` runs the whole normative acceptance gate.
//! Each task below enforces one of the rules `AGENTS.md` sets out, and each
//! names the rule it enforces when it fails, so that a red gate says *which
//! promise* was broken rather than merely that something is wrong.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use repo_model::{codegen, Model};

mod audit;
mod bootstrap;
mod proof;
mod scaffold;

fn main() -> ExitCode {
    let task = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "help".to_string());
    let write = std::env::args().nth(2).is_some_and(|a| a == "--write");
    let root = repo_model::repo_root();

    let result = match task.as_str() {
        "check-model" => check_model(&root, write),
        "audit-limits" => audit::audit_limits(&root),
        "audit-deferral" => audit::audit_deferral(&root),
        "audit-bootstrap" => bootstrap::audit(&root),
        "audit-dependency-updates" => bootstrap::audit_dependency_updates(&root),
        "audit-pii" => audit_pii(&root, std::env::args().nth(2)),
        "validate" => validate(&root),
        "proof-reuse" => proof::reuse(&root),
        "proof-keep" => proof::keep(&root, &std::env::args().nth(2).unwrap_or_default()),
        "new-capability" => {
            let args: Vec<String> = std::env::args().skip(2).collect();
            scaffold::new_capability(&root, &args)
        }
        _ => {
            eprintln!(
                "cargo xtask <task>\n\
                 \n\
                 check-model       R1: model/*.toml is the single source; regenerate and diff\n\
                 audit-limits      R5:  no bound that cannot be traced to a parameter\n\
                 audit-deferral    R4: no deferral marker, no stub, no capability behind a flag\n\
                 audit-bootstrap   immutable SDK and least-privilege workflow trust root\n\
                 audit-dependency-updates   SDK ownership and ordinary dependency maintenance\n\
                 validate          run every gate above\n\
                 proof-reuse       succeed only if the kept proof binds these exact proof inputs\n\
                 proof-keep <ID>   keep the proof prismpm verify just published, with its inputs\n\
                 new-capability <ID> <level> <suite> <statement>\n\
                                   R3: write the register row, scenario and failing test\n\
                 \n\
                 --write           check-model only: rewrite the generated file"
            );
            return ExitCode::from(2);
        }
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("gate failed: {e}");
            ExitCode::FAILURE
        }
    }
}

/// A gate failure, reported with the rule it broke.
type Fail = Box<dyn std::error::Error>;

/// R1, `CM-01`: the generated Rust consts equal the model, numeral for
/// numeral.
fn check_model(root: &Path, write: bool) -> Result<(), Fail> {
    let model = Model::load(&root.join("model"))?;
    model.check()?;

    let conformance = codegen::render_conformance(&model);
    let conformance_path: PathBuf = root.join(codegen::CONFORMANCE_PATH);

    if write {
        std::fs::write(&conformance_path, &conformance)?;
        println!("wrote {}", conformance_path.display());
        return Ok(());
    }

    let committed = std::fs::read_to_string(&conformance_path).map_err(|e| {
        format!(
            "{}: {e}\nrun `cargo xtask check-model --write`",
            conformance_path.display()
        )
    })?;
    if committed != conformance {
        return Err(format!(
            "{} is stale: it disagrees with model/ids.toml.\n\
             R2: a claim cannot exist in the documentation without a ledger row. \
             Run `cargo xtask check-model --write`.",
            conformance_path.display()
        )
        .into());
    }
    println!(
        "check-model: CONFORMANCE.md equals the model, {} ids (CM-01)",
        model.ids.id.len()
    );
    Ok(())
}

/// `PV-01`: no personal data in the tracked tree or, given a directory, in
/// every file under it (the assembled page in `pages.yml`). Findings name the
/// file, line and kind, never the value, because this output is public.
fn audit_pii(root: &Path, dir: Option<String>) -> Result<(), Fail> {
    use repo_conformance::privacy::{scan_dir, scan_tracked};
    let (scope, found) = match &dir {
        Some(dir) => (dir.as_str(), scan_dir(root, Path::new(dir))?),
        None => ("the tracked tree", scan_tracked(root)?),
    };
    if found.is_empty() {
        println!("audit-pii: no personal data in {scope} (PV-01)");
        return Ok(());
    }
    for finding in &found {
        eprintln!("{finding}");
    }
    Err(format!(
        "PV-01: {} value(s) in {scope} look personal. Use a reserved example domain \
         or a fictional number, or remove the value; the repository holds no personal data.",
        found.len()
    )
    .into())
}

/// The whole normative acceptance gate, in one place.
fn validate(root: &Path) -> Result<(), Fail> {
    check_model(root, false)?;
    audit::audit_limits(root)?;
    audit::audit_deferral(root)?;
    bootstrap::audit(root)?;
    audit_pii(root, None)?;
    println!("validate: every gate passed");
    Ok(())
}
