# prism-uorc: the Prism over UORC

The Prism runs over [UORC](https://github.com/UOR-Foundation/compression)
as its kappa. Every value the vault keeps is a uorc archive: the value's
lossless, executable object reference, sealed by `UORC-SHA256-CHAIN-v1`,
and named by the kappa label (`sha256:<hex>`) of the bytes it restores. The
structure is the reference; the value is projected only when the decision
answers `open`.

`spec.json` is the single source. `python3 -I tools/uorc/gen.py` writes
`app/src/PrismUorc.lex.tex`, `app/src/PrismUorcProofs.lex.tex` and the
mirror `site/uorc/table.mjs`; `python3 -I tools/uorc/standalone.py DIR`
writes the scratch project for `site/uorc/guest/uorc.wasm`.

## Request

`uorc <act> <halted> <seal> <format> <scope> <objects> <restore> <kappa>`

| Field | Values | Read from |
| --- | --- | --- |
| act | keep, open | the vault's step |
| halted | no, yes | the kill switch |
| seal | ok, broken | `inspect`: `integrity_ok` |
| format | known, other | `inspect`: format 2, profile 1 |
| scope | self, standard, other | `inspect`: self-contained, conditional on one of the lock's `standardBases`, or anything else |
| objects | one, many | `inspect`: one object |
| restore | same, differs, failed | `decompress` within the client's work bound, then the kappa label of what came back |
| kappa | admit, other | the kappa facet's answer for those bytes |

Answers: `keep`, `open`, `refuse` (and `invalid`). Fourteen guarantees,
proved with exactly `[Quot.sound, propext]`: every refusal above always
refuses, keep never opens, open never keeps, and a sound archive of an
admitted object is always kept (or opened) on either scope.

## The client

`site/uorc/uorc.lock.json` pins release `v0.4.0` (the newest published
release; `0.5.0` has none yet) by the asset's SHA-256 and each served file's
SHA-256 and size. Its `uorc.wasm` is the one UORC's own page names in its
`provenance.json`. A plain `cargo build` of the tag gives other bytes and
another standard basis, so the release asset, not a local build, is the
pin. Its conditional archives name one of two bases, the lock's
`standardBases`: `4a2e3a755b94142922dd119db978d5ad146651bd251344038b07a4988123c1ec`
for NCM profile 0x1ffff, and
`9272ab032bc3b608eb59684e8e9172cfb762892f22fecde6ea555bfb25112e1c` for every
narrower profile, which most mail and plain text take. With only the first
named, every item on the second was refused and never kept.
