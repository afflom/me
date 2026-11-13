# prism-kappa: kappa labels in the Prism

The Prism addresses objects as
[UOR-Foundation/kappa-registry](https://github.com/UOR-Foundation/kappa-registry)
does, from branch `feat/rewrite-after-poc` at commit
`618f477745e601f1bf1bd5cc62aed6fea4c8936d`. A kappa label is
`<axis>:<digest>`, the digest in lowercase hex, on one of six axes
(`crates/kappa-types/src/v1/axis.rs`):

| Axis | Wire name | Discriminant | Digest bytes | Computed by this browser |
| --- | --- | --- | --- | --- |
| Sha256 | `sha256` | 0 | 32 | WebCrypto `SHA-256` |
| Sha512 | `sha512` | 1 | 64 | WebCrypto `SHA-512` |
| Blake3 | `blake3` | 2 | 32 | no |
| Sha1 | `sha1` | 3 | 20 | no: kappa-registry needs collision detection |
| Sha3_256 | `sha3-256` | 4 | 32 | no |
| Keccak256 | `keccak256` | 5 | 32 | no |

kappa-registry itself is a server (OCI, Git, S3, Nix, AT Protocol and
kappa-distribution on one port). The Prism runs only in the owner's browser,
so it takes the registry's content address, not its server.

`spec.json` is the single source. `python3 -I tools/kappa/gen.py` writes
`app/src/PrismKappa.lex.tex`, `app/src/PrismKappaProofs.lex.tex` and the
JavaScript mirror `site/kappa/table.mjs`; then `lexlean fmt && lexlean lock`
in `app/`. `python3 -I tools/kappa/standalone.py DIR` writes a scratch
project that builds the standalone guest `site/kappa/guest/kappa.wasm`.

## Request

`kappa <label> <digest>`

The model reads four fields from the label itself, on its bytes, as
`Kappa::parse` does (`crates/kappa-types/src/v1/kappa.rs`):

| Field | Values | Read as |
| --- | --- | --- |
| colon | present, absent | the first `:` in the label |
| axis | sha256, sha512, blake3, sha1, sha3x256, keccak256, other | the bytes before it, against the six wire names |
| digits | right, wrong | the bytes after it number twice the axis's digest length |
| hex | lower, bad | every byte after it is `0-9` or `a-f` |

Only `digest` is a word on the line: `match`, `mismatch`, `uncomputed` or
`collision`, the browser's answer to whether the object's bytes re-derived
to the label.

Answers, in `Kappa::parse`'s order: `nocolon`, `unknownaxis`, `digits`,
`badhex`, then `collision`, `mismatch`, `unverified <axis> <discriminant>
<digest bytes>`, `admit <axis> <discriminant> <digest bytes>`, and `invalid`
for a malformed line or one longer than 146 bytes.

## Guarantees

Proved over `kappaJudge` with exactly `[Quot.sound, propext]`:

1. A label without its colon always answers `nocolon` (`NoColon`).
2. A label on any axis but the six always answers `unknownaxis` (`UnknownAxis`).
3. A digest of the wrong length is never admitted or unverified (`WrongDigitCount`).
4. A digest not in lowercase hex is never admitted or unverified (`BadHex`).
5. Bytes that do not re-derive are never admitted or unverified (`DigestMismatch`).
6. Bytes that collide on SHA-1 are never admitted or unverified (`CollisionDetected`).
7. A digest the browser could not re-derive is never admitted.
8. A well-formed label whose bytes re-derived is refused only for an unknown axis.

## In the browser

`site/kappa/kappa.mjs` computes labels with WebCrypto on the axes the spec
gives a host algorithm, asks the facet, and obeys only answers it expects.
Every object it admits also carries its SHA-256 label, kappa-registry's
mandatory secondary axis.
