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
- R4: rules 1 and 3 to 7 are rewritten the same way as Boundary and Learning,
  and every name carries the `r4` prefix (`R4Request`, `r4Judge`,
  `r4Dispatch`), because the holo build puts every module into one crate.

The modules carry no personal value. They speak of "the owner"; the owner's
facts live only in the browser.
