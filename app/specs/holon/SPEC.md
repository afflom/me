# prism-holon: the Prism's observer

The Prism measures itself, the owner included, after the reflexive holon of
[afflom/verdant-resonance](https://github.com/afflom/verdant-resonance)
(`Foundation.Teleology.V1.Model` at commit `2c6cd07`): every facet has a
directive, an objective and a KPI floor, the whole is a facet of itself, the
owner is a facet (the co-observer), self-reference alone is bounded, and the
observer reconciles the dissonance between the owner and the Prism.

`spec.json` is the single source, with `../curate/spec.json`.
`python3 -I tools/holon/gen.py` writes `app/src/PrismHolon(.Proofs).lex.tex`,
`app/src/PrismCurate(.Proofs).lex.tex` and `site/holon/table.mjs`;
`tools/holon/build.sh` proves and builds the two standalone guests in the
locked SDK image and pins them in `site/holon/guest.mjs`.

## Facets

| Facet | From | Directive | KPI |
| --- | --- | --- | --- |
| `resonance` | `app/specs/resonance/spec.json` | its purpose | kept share of what it brought forward |
| each place | `app/specs/surface/spec.json` | bring forward only what the owner keeps | kept share of what the place brought forward |
| `owner` | this spec | the co-observer: the reference | share of the owner's keeps the Prism had brought forward |
| `prism` | this spec | the whole as a facet of itself | share of measured facets at their floor |

Only a facet whose own spec lists `tunable` parameters is ever changed; today
that is the resonance engine.

## Request

`holon <halted> <floor> <signal> <tunable> <dissonance> <kpi>`

Answers: `hold`, `reconcile`, `curate`, `restore`, `refuse`, and `invalid`.
The browser measures the window (the last 64 signals): `signal` is `owner`
with at least 8 of the owner's gestures, `dissonance` is `high` at or above
250 per mille of what was brought forward being dismissed, `floor` is
`regressed` when the first-modeled parameters Pareto-dominate what runs.

## Guarantees

Proved over `holonJudge` with exactly `[Quot.sound, propext]`:

1. Halted always refuses.
2. Not halted never refuses.
3. A regressed floor, not halted, is always restored.
4. The Prism's own measures alone never reconcile or curate.
5. A facet with nothing tunable is never reconciled or curated.
6. High dissonance on the owner's gestures, floor held, tunable, is always reconciled.
7. High dissonance never curates.
8. When the owner and the Prism agree, nothing is reconciled or curated.
9. A floor that holds is never restored.
