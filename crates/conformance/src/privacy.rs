//! `PV-01`: no personal data in the repository or in the built page.
//!
//! The app is generic: it models "the owner" and never names anyone, and the
//! owner's content lives only in their browser. This gate is what keeps that
//! promise mechanical. It reads every tracked file (and, in `pages.yml`, every
//! file of the assembled page) and refuses five kinds of value:
//!
//! - an email address at any domain but the reserved ones (RFC 2606, RFC 6761);
//! - a phone number in international form (`+` and 8 to 15 digits), except the
//!   fictional North American range 555-0100 to 555-0199;
//! - a payment card number: 13 to 19 digits with a card issuer's prefix that
//!   pass the Luhn check;
//! - a US Social Security number shaped `ddd-dd-dddd` that could be issued;
//! - any term in `.pii-deny`, a file the owner keeps locally and git ignores.
//!
//! A finding names the file, the line and the kind, never the value: the gate's
//! own output goes to public CI logs, and printing what it found would publish
//! it. Detection is deliberately crude, like the other grep-shaped gates; a
//! synthetic fixture uses a reserved domain or a fictional number instead of
//! arguing with the gate.

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The local, git-ignored file of the owner's own terms (names, addresses).
pub const DENY_FILE: &str = ".pii-deny";

/// What a finding is, without the value that was found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// An email address at a domain that is not reserved for examples.
    Email,
    /// A phone number in international form.
    Phone,
    /// A Luhn-valid number with a payment card issuer's prefix.
    Card,
    /// A US Social Security number that could be issued.
    NationalId,
    /// A term from the owner's local deny file.
    Denied,
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Kind::Email => "email address",
            Kind::Phone => "phone number",
            Kind::Card => "payment card number",
            Kind::NationalId => "national ID number",
            Kind::Denied => "term from .pii-deny",
        })
    }
}

/// One refused value: where it is and what kind it is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Finding {
    /// The file, relative to the scanned root.
    pub path: String,
    /// The line, counted from 1.
    pub line: usize,
    /// The kind of value.
    pub kind: Kind,
}

impl fmt::Display for Finding {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}: {} (PV-01)", self.path, self.line, self.kind)
    }
}

/// Every finding in `text`, attributed to `path`.
pub fn scan_text(path: &str, text: &str, deny: &[String]) -> Vec<Finding> {
    let mut out = Vec::new();
    for (i, line) in text.lines().enumerate() {
        let mut kinds = Vec::new();
        if has_email(line) {
            kinds.push(Kind::Email);
        }
        if has_phone(line) {
            kinds.push(Kind::Phone);
        }
        if has_card(line) {
            kinds.push(Kind::Card);
        }
        if has_ssn(line) {
            kinds.push(Kind::NationalId);
        }
        let lower = line.to_lowercase();
        if deny.iter().any(|t| lower.contains(t.as_str())) {
            kinds.push(Kind::Denied);
        }
        for kind in kinds {
            out.push(Finding {
                path: path.to_string(),
                line: i + 1,
                kind,
            });
        }
    }
    out
}

/// The owner's deny terms from `<root>/.pii-deny`: one term per line, blank
/// lines and `#` comments skipped, compared case-insensitively. None when the
/// file is absent, as it is in CI.
pub fn deny_terms(root: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(root.join(DENY_FILE)) else {
        return Vec::new();
    };
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_lowercase)
        .collect()
}

/// Every finding in the files git tracks under `root`.
pub fn scan_tracked(root: &Path) -> Result<Vec<Finding>, String> {
    let listed = Command::new("git")
        .args(["ls-files", "-z"])
        .current_dir(root)
        .output()
        .map_err(|e| format!("git ls-files: {e}"))?;
    if !listed.status.success() {
        return Err(format!(
            "git ls-files: {}",
            String::from_utf8_lossy(&listed.stderr)
        ));
    }
    let deny = deny_terms(root);
    let mut out = Vec::new();
    for rel in listed.stdout.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        let rel = String::from_utf8_lossy(rel).to_string();
        let path = root.join(&rel);
        if !path.is_file() {
            continue;
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("{rel}: {e}"))?;
        out.extend(scan_text(&rel, &String::from_utf8_lossy(&bytes), &deny));
    }
    Ok(out)
}

/// Every finding in every file under `dir` (the assembled page), with the deny
/// terms of `root`.
pub fn scan_dir(root: &Path, dir: &Path) -> Result<Vec<Finding>, String> {
    let deny = deny_terms(root);
    let pinned = pinned_pieces(dir);
    let mut files = Vec::new();
    walk(dir, &mut files)?;
    files.sort();
    let mut out = Vec::new();
    for path in files {
        let rel = path
            .strip_prefix(dir)
            .unwrap_or(&path)
            .display()
            .to_string();
        if pinned.contains(&rel) {
            continue;
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        out.extend(scan_text(&rel, &String::from_utf8_lossy(&bytes), &deny));
    }
    Ok(out)
}

/// The pieces of R4's engine and weights the page serves (`R4-01`), by the
/// path each has in the page: `r4/objects/<sha256>.gz` for every piece
/// fingerprint `r4/r4.lock.json` names. Their content is fixed by that hash to
/// public upstream bytes, which `bootstrap/r4-objects.mjs` checks before writing
/// them and every browser checks again, so no personal value can enter through
/// them; compressed, they match the text patterns by chance. Any other file
/// there, or a piece the lock does not name, is scanned as usual.
fn pinned_pieces(dir: &Path) -> std::collections::BTreeSet<String> {
    let Ok(lock) = std::fs::read_to_string(dir.join("r4").join("r4.lock.json")) else {
        return std::collections::BTreeSet::new();
    };
    lock.split("\"pieces\": [")
        .skip(1)
        .filter_map(|rest| rest.split(']').next())
        .flat_map(|list| list.split("\"fingerprint\": \"sha256-").skip(1))
        .filter_map(|rest| rest.get(..64))
        .filter(|hex| {
            hex.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
        .map(|hex| {
            format!(
                "r4{sep}objects{sep}{hex}.gz",
                sep = std::path::MAIN_SEPARATOR
            )
        })
        .collect()
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            walk(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

const RESERVED_DOMAINS: [&str; 3] = ["example.com", "example.net", "example.org"];
const RESERVED_TLDS: [&str; 4] = ["example", "invalid", "test", "localhost"];

fn is_local(c: char) -> bool {
    c.is_ascii_alphanumeric() || "._%+-".contains(c)
}

fn is_domain(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '-'
}

fn has_email(line: &str) -> bool {
    let chars: Vec<char> = line.chars().collect();
    for (at, c) in chars.iter().enumerate() {
        if *c != '@' {
            continue;
        }
        let local = chars[..at]
            .iter()
            .rev()
            .take_while(|c| is_local(**c))
            .count();
        if local == 0 {
            continue;
        }
        let domain: String = chars[at + 1..]
            .iter()
            .take_while(|c| is_domain(**c))
            .collect();
        let domain = domain.trim_end_matches(['.', '-']).to_ascii_lowercase();
        let Some((_, tld)) = domain.rsplit_once('.') else {
            continue;
        };
        if tld.len() < 2 || !tld.chars().all(|c| c.is_ascii_alphabetic()) {
            continue;
        }
        let reserved = RESERVED_DOMAINS
            .iter()
            .any(|d| domain == *d || domain.ends_with(&format!(".{d}")))
            || RESERVED_TLDS.contains(&tld);
        if !reserved {
            return true;
        }
    }
    false
}

/// Runs of digits joined by single separators from `seps`, each with the
/// character before it and the character after it (None at a line's edge).
fn digit_runs(chars: &[char], seps: &str) -> Vec<(Option<char>, Vec<String>, Option<char>)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let before = if i == 0 { None } else { Some(chars[i - 1]) };
        let mut groups = vec![String::new()];
        while i < chars.len() {
            let c = chars[i];
            if c.is_ascii_digit() {
                if let Some(g) = groups.last_mut() {
                    g.push(c);
                }
                i += 1;
            } else if seps.contains(c) && i + 1 < chars.len() && chars[i + 1].is_ascii_digit() {
                groups.push(String::new());
                i += 1;
            } else {
                break;
            }
        }
        out.push((before, groups, chars.get(i).copied()));
    }
    out
}

fn bounded(before: Option<char>, after: Option<char>) -> bool {
    let free = |c: Option<char>| c.is_none_or(|c| !c.is_ascii_alphanumeric() && c != '.');
    free(before) && free(after)
}

fn has_phone(line: &str) -> bool {
    let chars: Vec<char> = line.chars().collect();
    for (i, c) in chars.iter().enumerate() {
        if *c != '+' || i > 0 && chars[i - 1].is_ascii_alphanumeric() {
            continue;
        }
        let mut digits = String::new();
        let mut j = i + 1;
        while j < chars.len() {
            let c = chars[j];
            if c.is_ascii_digit() {
                digits.push(c);
            } else if !" -.()".contains(c) {
                break;
            }
            j += 1;
        }
        if !digits.starts_with(|c: char| ('1'..='9').contains(&c)) {
            continue;
        }
        if chars.get(j).is_some_and(|c| c.is_ascii_alphanumeric()) {
            continue;
        }
        if !(8..=15).contains(&digits.len()) {
            continue;
        }
        let fictional = digits.len() == 11 && digits.starts_with('1') && &digits[4..9] == "55501";
        if !fictional {
            return true;
        }
    }
    false
}

fn luhn(digits: &str) -> bool {
    let sum: u32 = digits
        .bytes()
        .rev()
        .enumerate()
        .map(|(i, b)| {
            let d = u32::from(b - b'0');
            if i % 2 == 1 {
                let x = d * 2;
                if x > 9 {
                    x - 9
                } else {
                    x
                }
            } else {
                d
            }
        })
        .sum();
    sum.is_multiple_of(10)
}

fn issuer(digits: &str) -> bool {
    let n = |k: usize| digits.get(..k).and_then(|p| p.parse::<u32>().ok());
    digits.starts_with('4')
        || n(2).is_some_and(|p| (51..=55).contains(&p) || p == 34 || p == 37 || p == 35 || p == 65)
        || n(4).is_some_and(|p| (2221..=2720).contains(&p) || p == 6011)
        || n(3).is_some_and(|p| (644..=649).contains(&p))
}

fn has_card(line: &str) -> bool {
    let chars: Vec<char> = line.chars().collect();
    digit_runs(&chars, " -")
        .into_iter()
        .any(|(before, groups, after)| {
            if groups.len() > 1 && groups.iter().any(|g| g.len() < 3) {
                return false;
            }
            let digits: String = groups.concat();
            bounded(before, after)
                && (13..=19).contains(&digits.len())
                && issuer(&digits)
                && luhn(&digits)
                && digits
                    .chars()
                    .any(|c| c != digits.chars().next().unwrap_or('0'))
        })
}

fn has_ssn(line: &str) -> bool {
    let chars: Vec<char> = line.chars().collect();
    digit_runs(&chars, "-")
        .into_iter()
        .any(|(before, groups, after)| {
            let shaped = groups.len() == 3
                && groups[0].len() == 3
                && groups[1].len() == 2
                && groups[2].len() == 4;
            let free = |c: Option<char>| c.is_none_or(|c| c != '-');
            shaped
                && bounded(before, after)
                && free(before)
                && free(after)
                && groups[0] != "000"
                && groups[0] != "666"
                && !groups[0].starts_with('9')
                && groups[1] != "00"
                && groups[2] != "0000"
        })
}
