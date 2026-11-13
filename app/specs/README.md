# Reasoning core specs

The reasoning and storage modules in `app/src` were drafted with the Prism guided path
(`prism_spec`), one app each, then moved into this project as library modules.
Each folder keeps the spec that generated its module, so a reader can see the
questions, the examples and the guarantees in plain words.

| Module | Spec | What it decides | Guarantees |
| --- | --- | --- | --- |
| `PrismBoundary` | `boundary/` | whether one labeled fact about the owner may go to a destination: allow, hash only, ask, or deny | 7 |
| `PrismLearning` | `learning/` | how a belief's weight (1..16) moves on a signal: raise, lower, hold, consolidate, demote, confirm, reject | 8 |
| `PrismChronology` | `chronology/` | Allen's 13 interval relations between two spans, in minutes of the week | 8 |
| `PrismR4` | `r4/` | whether one answer of a language model may be shown: answer, receipt only, ask, or refuse; refuses wrong engine or weight bytes and mixed model modes (compiled with Prism, a model in Prism, models routed by R4) | 7 |
| `PrismVaultStore` | `vault-store/` | whether the browser vault may keep one value: store, store a hash only, ask, or refuse | 5 |
| `PrismVaultRestore` | `vault-restore/` | whether the browser vault may give one stored object back: restore, hash only, or refuse | 5 |
| `PrismGoogle` | `google/` | whether the page may make one Gmail or Calendar API call: fetch, consent, ask, or refuse | 7 |
| `PrismGoogleLink` | `google-link/` | the Google connection's next stage: unprovisioned, registered, granted, syncing, revoked, or refuse | 9 |
| `PrismDest` | `dest/` | where one item may go next: deliver (to the owner's calendar, mail or another platform), draft, show (to the owner), hold (quietly), or refuse | 11 |
| `PrismModels` | `models/` | whether one language or reasoning model routed into the Prism from a hub may be fetched or run in the browser: run, fetch, ask the owner, or refuse; refuses unpinned models, unknown formats and bytes that differ from the lock, and moves nothing while halted or ungranted | 9 |
| `PrismKappa` | `kappa/` | whether one object may enter the Prism under its kappa label, the content address of UOR-Foundation/kappa-registry: admit, unverified, or a refusal named for kappa-registry's parse and digest errors; the model reads the label itself | 8 |
| `PrismUorc` | `uorc/` | whether one value may be kept in, or opened from, the vault as its UORC archive, from the archive's structure alone (seal, format, basis, object count, restore, kappa): keep, open, or refuse | 14 |
| `PrismHolon` | `holon/` | what the Prism's observer does next for one facet (the resonance engine, each place, the owner, the Prism itself), each with a directive, an objective and a KPI floor: hold, reconcile toward the owner, curate, restore the floor, or refuse | 9 |
| `PrismCurate` | `curate/` | whether one candidate set of a facet's tunable parameters (a Rule-30 hypothesis or a reconciliation) replaces what runs: adopt under a new kappa-named claim, recall, keep, or refuse | 13 |
| `PrismResonance` | `resonance/` | how the Prism answers one gesture of the owner toward one thing it holds: rest, whisper, chime, bloom (it comes forward), chorus (what belongs with it comes too), or recede; stillness meets rest, a dismissal recedes at once, quiet and a hurried pace are never met with more, and a rejected belief never comes forward | 10 |

Boundary guarantees: nothing moves while the Prism is halted; nothing goes to
GitHub or the hosted verifier, even with approval; nothing a detector matched is
allowed; restricted data is never allowed; nothing goes outbound without the
owner's approval; a personal identifier never leaves the browser.

Store guarantees: refuse when the address does not re-derive; refuse when the
Boundary denies; never keep a value the Boundary allowed only as a hash; never
keep without the key; never keep while the owner's approval is pending.
Restore guarantees: refuse on an address mismatch, a broken seal, a missing key
or an unknown envelope; never restore a hash-only record as a value.

Every guarantee is proved with exactly the axioms `[Quot.sound, propext]`.

## Regenerating

These modules are hand-patched after generation, so do not regenerate them from
`spec.json` without re-applying the patches:

- Boundary and Learning: the rule lists are rewritten as nested De Morgan
  conditions, so the proofs avoid `Classical.choice`.
- Vault store and restore: every name carries its facet (`StoreRequest`,
  `storeDispatch`, `restoreJudge`, ...), because the one guest flattens every
  module into a single crate, where two names may not meet.
- Google: the rule lists are rewritten as nested De Morgan conditions (as Boundary).
- Google link: the judge is a tree on the event, because the flat chain is 12
  rules deep and Lean's `split` gives up; the first-match answers are unchanged.
- Chronology: the judge is a decision tree, because Lean's `split` gives up on
  an if-chain 13 or more deep.
- Models: every name carries the `models` prefix (`ModelsRequest`,
  `modelsJudge`, `modelsDispatch`) and the application record is removed. Its
  rules are single equalities, so it needs no De Morgan rewrite.
- UORC: generated by `tools/uorc/gen.py` (the destinations generator's tree pattern); every name carries the `uorc` prefix.
- Kappa: generated by `tools/kappa/gen.py`, not by the guided path; every name carries the `kappa` prefix, and the model reads the label's colon, axis, digit count and hex itself, so only the digest word comes from the browser.
- Holon and Curate: generated by `tools/holon/gen.py`; every name carries its facet prefix.
- R4: rules 1 and 3 to 7 are rewritten the same way as Boundary and Learning,
  and every name carries the `r4` prefix (`R4Request`, `r4Judge`,
  `r4Dispatch`), because the holo build puts every module into one crate.

The modules carry no personal value. They speak of "the owner"; the owner's
facts live only in the browser.
- Resonance: written by the generic `tools/facet/gen.py app/specs/resonance/spec.json`
  (the dest generator, parameterized by the spec's `facet` record). It checks every
  request against every guarantee and example before writing, and `--check`
  holds the outputs to the spec. Its standalone guest comes from
  `tools/facet/standalone.py`.
- Router (the R4 router): written by `tools/facet/gen.py app/specs/router/spec.json`.
  It decides, for one value of incoming content in its own schema and one Prism
  feature, whether that feature's compiled reader maps it (`map`), the schema's
  own typed value is taken (`direct`), or nothing happens (`skip`, `refuse`).
  The spec's `providers` record names each feature's compiled model and its
  rules; the generator carries it into `site/router/table.mjs` for
  `site/router/features.mjs`. There is no routing control on the page.
