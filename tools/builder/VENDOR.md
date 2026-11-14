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
