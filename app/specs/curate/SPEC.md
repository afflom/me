# prism-curate: the observer's curator

After the conservatory curation of
[afflom/verdant-resonance](https://github.com/afflom/verdant-resonance)
(`src/game/conservatoryCurationEngine.ts` at commit `2c6cd07`): a 64-cell
cyclic Rule-30 register proposes hypotheses, the defect = 0 gate refuses any
humane defect, strict Pareto dominance admits a new incumbent, every
admission is a kappa-named claim minted once, and the floor never regresses.
Generated with `../holon/` (see its SPEC.md).

## Request

`curate <halted> <tunable> <label> <defect> <evidence> <floor> <move> <eased> <dominance> <claim>`

Answers: `adopt` (and mint the claim), `recall` (a claim already minted),
`keep` (what runs stays), `refuse`, and `invalid`.

The browser builds each candidate: on `curate`, the register steps and each
of its four lanes moves one tunable by one to four steps; on `reconcile`, the
one-step move that most lowers the owner's dismissals on replay. It replays
the candidate, the incumbent and the floor on the window with the engine's
own `replay`, on the objectives `dissonant`, `missed` and `interruptions`
(each minimized), and names the claim
`sha256(prism/curate-claim/1|facet|parameters|objectives|move)`, admitted by
the kappa facet.

## Guarantees

Proved over `curateJudge` with exactly `[Quot.sound, propext]`:

1. Halted always refuses.
2. A parameter off its spec always refuses.
3. A claim label the kappa facet did not admit always refuses.
4. A humane defect is never adopted or recalled.
5. Without the owner's gestures nothing is adopted or recalled.
6. Below the floor nothing is adopted or recalled.
7. A hypothesis equal to what runs is not adopted or recalled.
8. A hypothesis dominated by what runs is not adopted or recalled.
9. A hypothesis that trades one objective for another is not adopted or recalled.
10. A reconciliation that does not ease dismissals is not adopted or recalled.
11. A known claim is never minted again.
12. A new claim is never recalled.
13. A well-formed, kappa-named candidate is weighed, never refused.
