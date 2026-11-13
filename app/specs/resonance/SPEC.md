# Prism Resonance

The Prism answers the owner as afflom/verdant-resonance answers its player,
without its garden. `spec.json` is the single source:
`python3 -I tools/facet/gen.py app/specs/resonance/spec.json` writes
`app/src/PrismResonance.lex.tex`, `app/src/PrismResonanceProofs.lex.tex` and
`site/resonance/table.mjs`, after judging all 1920 requests against every
guarantee and example.

## Request

`<gesture> <pace> <salience> <phase> <belief> <attention> <halted>`, one space
apart; anything else is `invalid`. The page derives gesture, pace, salience and
phase from what the browser saw, by the spec's `tunable` bounds; belief is the
thing's PrismLearning state; attention and halted are the owner's switches.

## Answers

`rest`, `whisper`, `chime`, `bloom`, `chorus`, `recede`. bloom and chorus send
`support` to PrismLearning, recede sends `contradict`; the owner alone sends
`ownerconfirm` and `ownerreject`.

## Guarantees

Each is a theorem `resonanceInvNNNHolds` in `PrismResonanceProofs`, proved by
`linear_arithmetic` with exactly `[Quot.sound, propext]`; the reasons are the
`why` of each guarantee in `spec.json`.

## Verdant, without the garden

| verdant-resonance | here |
| --- | --- |
| observe, attune, touch, stroll, stillness | open, dwell, keep, dismiss, still |
| velocity, proximity, atmosphere, chorus | pace, salience, phase, belief |
| Neuromorphic Hebbian plasticity | PrismLearning, weights 1..16, owner-only confirm |
| Anamnesis Merkle snapshot, restore(persist(S)) = S | sealed snapshot of addresses, states and weights |
| Humane restorative pacing, Turiya, Ahimsa | guarantees 1 to 10 |
