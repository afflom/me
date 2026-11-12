# prism-dest: the Prism routed out

The Prism routes its sources in (Google, the owner's own input, through the
Boundary and the vault). `PrismDest` routes it out: to the owner, who is the
first destination and the Prism's stakeholder, and to the places the owner
acts in. One request decides where one item may go next.

`spec.json` is the single source. `python3 -I tools/dest/gen.py` writes
`app/src/PrismDest.lex.tex`, `app/src/PrismDestProofs.lex.tex` and the
JavaScript mirror `site/dest/table.mjs`; then `lexlean fmt && lexlean lock`
in `app/`. `python3 -I tools/dest/standalone.py DIR` writes a scratch project
that builds the standalone guest `site/dest/guest/dest.wasm`.

## Request

`dest <target> <verdict> <cause> <act> <wording> <tone> <pace> <urgency> <halted>`

| Field | Values | Meaning |
| --- | --- | --- |
| target | owner, calendar, mail, platform, other | the owner's own view, their calendar, a mail message, another platform (share sheet or file), or anything else |
| verdict | allow, ask, hashonly, deny | the Boundary's answer for this content to this destination (browser for the owner, outbound for the rest) |
| cause | grounded, orphan | the item traces to a source the Prism read or to the owner's own input, or to nothing |
| act | none, owner | the owner pressed the button for this very delivery |
| wording | seen, changed | the outgoing bytes are exactly the bytes the owner saw (SHA-256 seal) |
| tone | calm, coercive | the tone check: pressure, false urgency or scarcity, guilt, threat |
| pace | open, quiet | the owner's attention right now |
| urgency | normal, urgent | the owner marked the item worth breaking quiet for |
| halted | no, yes | the kill switch |

Answers: `deliver`, `draft`, `show`, `hold`, `refuse` (and `invalid` for a malformed line).

## The physics: from afflom/verdant-resonance

The guarantees restate, for routing, the laws that `Foundation.Dharma.V1.Model`
and `Foundation.Vedanta.V1.Model` (with `Foundation.Humane.V1.Model`) prove for
the conservatory. Those modules are not imported: their descriptors carry
`Classical.choice`, and this app proves only on `[Quot.sound, propext]`.

| Law | In verdant-resonance | Here |
| --- | --- | --- |
| Pratityasamutpada | 0 acausal phenomena, 12-link closure | INV-003: an item with no cause is never routed |
| Ahimsa | 0 violent or coercive rules, 0 dark patterns | INV-005: nothing leaves without the owner's act; INV-007: coercive words never leave; INV-008: coercive content is never pushed into the owner's view |
| Satya | 0 drift between spec and runtime | INV-006: what goes out is byte-for-byte what the owner saw |
| Aparigraha | non-grasping, zero hoarding | INV-009: restricted content never leaves, even with the owner's act |
| Lokasangraha | the welfare of all | INV-007 protects the correspondent as well as the owner |
| Turiya (silent witness) | stillness phase, rest | INV-011: quiet is kept; only what the owner marked urgent breaks it |
| Humane: user agency preserved | no punitive timers, agency kept | INV-010: the owner is reached only by being shown or by a quiet hold |
| Rta (lawful order) | lawful bounds | INV-001: the kill switch stops every route; INV-002: only modeled destinations; INV-004: the Boundary's deny is final |

## Guarantees

Each is a theorem `destInvNNNHolds` in `PrismDestProofs`, proved by
`linear_arithmetic` over every request with exactly `[Quot.sound, propext]`.

1. Halted: always `refuse`.
2. Target other: always `refuse`.
3. Cause orphan: always `refuse`.
4. Verdict deny: always `refuse`.
5. Act none: never `deliver`.
6. Wording changed: never `deliver`.
7. Tone coercive: never `deliver`.
8. Tone coercive: never `show`.
9. Verdict hashonly: never `deliver` or `draft`.
10. Target owner: never `deliver` or `draft`.
11. Pace quiet and urgency normal: never `show`.

## How the page uses it

`site/dest/dest.mjs` asks the Boundary (`browser` for the owner, `outbound`
for the rest, with the owner's act as the approval) and then `dest`. Prepare
asks with act none, so the Prism alone can only draft, show or hold. Send asks
with the owner's act and the seal of the words they saw, and hands the bytes
to an app the owner already uses only on `deliver`: an RFC 5322 reply as a
`mailto:` link or `.eml`, an iCalendar `.ics` (METHOD:PUBLISH, invites no
one), or the device's share sheet. No host is called and nothing is set up.

Language models (R4, or models R4 routes) only propose wording; their words
reach a destination only through this decision, so the owner's act on the
seen bytes is always the last step.
