//! The pipeline model rendered: `cargo xtask pipeline [--write]`.
//!
//! `app/specs/pipeline/spec.json` names each workflow this repository owns, and
//! `app/specs/pipeline/workflows/<name>.json` holds it as data: its triggers,
//! permissions, jobs and steps, and the reason for each (the `#` entry of a
//! mapping gives the comment lines above each of its keys; `""` is the comment
//! above a list item such as a step). This renders each to
//! `.github/workflows/<name>`. Without `--write` a rendered file that differs
//! from the model fails, so a workflow is changed only by changing the model;
//! a model file the list does not name fails too.
//! The template's own workflows (`bootstrap.yml` and the others template.lock
//! names) are not in the model.

use std::path::Path;

use serde_json::{Map, Value};

use crate::Fail;

const MODEL: &str = "app/specs/pipeline/spec.json";
const WORKFLOWS: &str = "app/specs/pipeline/workflows";

/// The order a reader expects a workflow's, a job's and a step's keys in;
/// any other key follows, in name order.
const ORDER: [&str; 31] = [
    "name",
    "run-name",
    "id",
    "on",
    "if",
    "needs",
    "uses",
    "runs-on",
    "timeout-minutes",
    "outputs",
    "permissions",
    "environment",
    "concurrency",
    "strategy",
    "defaults",
    "with",
    "env",
    "shell",
    "working-directory",
    "continue-on-error",
    "group",
    "cancel-in-progress",
    "types",
    "branches",
    "branches-ignore",
    "paths",
    "paths-ignore",
    "workflows",
    "cron",
    "jobs",
    "steps",
];

fn keys(map: &Map<String, Value>) -> Vec<&String> {
    let mut out: Vec<&String> = map.keys().filter(|k| k.as_str() != "#").collect();
    out.sort_by_key(|k| {
        (
            ORDER.iter().position(|o| o == k).unwrap_or(ORDER.len()),
            k.as_str(),
        )
    });
    // `run` is a step's last key: what the step does, after how it runs.
    if let Some(i) = out.iter().position(|k| k.as_str() == "run") {
        let run = out.remove(i);
        out.push(run);
    }
    out
}

fn plain(s: &str) -> bool {
    let reserved = [
        "true", "false", "yes", "no", "on", "off", "null", "~", "y", "n",
    ];
    !s.is_empty()
        && s.trim() == s
        && !reserved.contains(&s.to_ascii_lowercase().as_str())
        && s.parse::<f64>().is_err()
        && !s.starts_with([
            '-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%',
            '@', '`',
        ])
        && !s.contains(": ")
        && !s.contains(" #")
        && !s.ends_with(':')
}

fn scalar(s: &str) -> String {
    if plain(s) {
        s.to_string()
    } else {
        Value::String(s.to_string()).to_string()
    }
}

/// A key: plain like a value, except that `on` names a workflow's triggers.
fn key_text(s: &str) -> String {
    if s == "on" || plain(s) {
        s.to_string()
    } else {
        Value::String(s.to_string()).to_string()
    }
}

fn comments(out: &mut String, indent: usize, lines: Option<&Value>) {
    for line in lines.and_then(Value::as_array).into_iter().flatten() {
        let text = line.as_str().unwrap_or_default();
        let pad = " ".repeat(indent);
        if text.is_empty() {
            out.push_str(&format!("{pad}#\n"));
        } else {
            out.push_str(&format!("{pad}# {text}\n"));
        }
    }
}

fn block(out: &mut String, indent: usize, s: &str) {
    let chomp = if s.ends_with('\n') { "|" } else { "|-" };
    out.push_str(&format!(" {chomp}\n"));
    for line in s.strip_suffix('\n').unwrap_or(s).split('\n') {
        if line.is_empty() {
            out.push('\n');
        } else {
            out.push_str(&format!("{}{line}\n", " ".repeat(indent)));
        }
    }
}

/// `value` after `key:` (or after `- `) at `indent`.
fn value(out: &mut String, indent: usize, v: &Value) {
    match v {
        Value::Null => out.push('\n'),
        Value::Bool(b) => out.push_str(&format!(" {b}\n")),
        Value::Number(n) => out.push_str(&format!(" {n}\n")),
        Value::String(s) if s.contains('\n') => block(out, indent + 2, s),
        Value::String(s) => out.push_str(&format!(" {}\n", scalar(s))),
        Value::Array(items) if items.is_empty() => out.push_str(" []\n"),
        Value::Object(map) if keys(map).is_empty() => out.push_str(" {}\n"),
        Value::Array(items) => {
            out.push('\n');
            for item in items {
                list_item(out, indent + 2, item);
            }
        }
        Value::Object(map) => {
            out.push('\n');
            mapping(out, indent + 2, map, false);
        }
    }
}

fn list_item(out: &mut String, indent: usize, item: &Value) {
    let pad = " ".repeat(indent);
    match item {
        Value::Object(map) => {
            comments(out, indent, map.get("#").and_then(|c| c.get("")));
            out.push_str(&format!("{pad}- "));
            mapping(out, indent + 2, map, true);
        }
        Value::String(s) if !s.contains('\n') => out.push_str(&format!("{pad}- {}\n", scalar(s))),
        other => {
            out.push_str(&format!("{pad}-"));
            value(out, indent, other);
        }
    }
}

/// A mapping's keys at `indent`; `inline` when its first key follows `- `.
fn mapping(out: &mut String, indent: usize, map: &Map<String, Value>, inline: bool) {
    let notes = map.get("#");
    for (i, key) in keys(map).into_iter().enumerate() {
        if !(inline && i == 0) {
            comments(out, indent, notes.and_then(|c| c.get(key.as_str())));
            out.push_str(&" ".repeat(indent));
        }
        out.push_str(&format!("{}:", key_text(key)));
        value(out, indent, &map[key.as_str()]);
    }
}

/// One workflow of the model as its file.
pub fn render(name: &str, workflow: &Map<String, Value>) -> String {
    let mut out = format!(
        "# {name} is rendered from the pipeline model, {WORKFLOWS}/{name}.json, by\n\
         # `cargo run -q --locked -p xtask -- pipeline --write`: change the model, not this file.\n"
    );
    if let Some(head) = workflow.get("#").and_then(|c| c.get("")) {
        out.push_str("#\n");
        comments(&mut out, 0, Some(head));
    }
    let top = keys(workflow);
    for key in top {
        comments(
            &mut out,
            0,
            workflow.get("#").and_then(|c| c.get(key.as_str())),
        );
        out.push_str(&format!("{}:", key_text(key)));
        value(&mut out, 0, &workflow[key.as_str()]);
        out.push('\n');
    }
    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}

pub fn pipeline(root: &Path, write: bool) -> Result<(), Fail> {
    let model: Value = serde_json::from_str(&std::fs::read_to_string(root.join(MODEL))?)?;
    let names: Vec<String> = model
        .get("workflows")
        .and_then(Value::as_array)
        .ok_or("the pipeline model names no workflows")?
        .iter()
        .map(|n| {
            n.as_str()
                .map(str::to_string)
                .ok_or("a workflow is named by a string")
        })
        .collect::<Result<_, _>>()?;
    for entry in std::fs::read_dir(root.join(WORKFLOWS))? {
        let file = entry?.file_name().to_string_lossy().into_owned();
        let named = file
            .strip_suffix(".json")
            .is_some_and(|n| names.iter().any(|m| m == n));
        if !named {
            return Err(format!("{WORKFLOWS}/{file} is not a workflow {MODEL} names").into());
        }
    }
    let mut stale = Vec::new();
    for name in &names {
        let text = std::fs::read_to_string(root.join(WORKFLOWS).join(format!("{name}.json")))?;
        let workflow: Value = serde_json::from_str(&text)?;
        let workflow = workflow
            .as_object()
            .ok_or_else(|| format!("{name}: a workflow is a mapping"))?;
        let path = root.join(".github/workflows").join(name);
        let rendered = render(name, workflow);
        if write {
            std::fs::write(&path, rendered)?;
        } else if std::fs::read_to_string(&path).ok().as_deref() != Some(rendered.as_str()) {
            stale.push(name.clone());
        }
    }
    if stale.is_empty() {
        println!(
            "pipeline: {} workflows are what {WORKFLOWS} renders",
            names.len()
        );
        Ok(())
    } else {
        Err(format!(
            "{} differ from {WORKFLOWS}: change the model and run `cargo run -q --locked -p xtask -- pipeline --write`",
            stale.join(", ")
        )
        .into())
    }
}
