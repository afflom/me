# The Prism-DevRel builder, vendored

`tools/builder/` is `builder/` of [afflom/prism-devrel](https://github.com/afflom/prism-devrel)
without its own test file, copied unchanged so `tools/prompts/gen.py` runs it
with no network. Source: `main` at merge commit
`07af20eeaa8f7a12cd991f650ef6d5b28b41a52c` (afflom/prism-devrel#16, merged: constructive proofs, factored long
tables, a set hosted by this repository's own root, id prefixes that never
collide).

To update: copy `builder/` from that repository at a newer commit, delete
`test.mjs`, record the commit here, and run `python3 -I tools/prompts/gen.py`.
`BS-01` fails until every generated file matches.

## Local patch, until upstream takes it

`set.mjs` `idPrefixes`: a claim-id prefix an earlier app of the set already
holds is lengthened by the next letters of the name's last word, exactly as a
prefix another suite's rows hold is, instead of refusing the set. Upstream
refuses `prism-host` with `prism-holon` (both `PH`) and `prism-r4` with
`prism-router` and `prism-resonance` (all `PR`). The set lists new decisions
last, so the first app keeps its prefix and no existing id moves
(prism-holon takes `PHO`). Offer this upstream to afflom/prism-devrel; drop it
here when a pinned commit has it.
