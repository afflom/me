# The Prism-DevRel builder, vendored

`tools/builder/` is `builder/` of [afflom/prism-devrel](https://github.com/afflom/prism-devrel)
without its own test file, copied unchanged so `tools/prompts/gen.py` runs it
with no network. Source: `main` at merge commit
`3c703cc614bbc55f9124fe57e093ae1a59631480` (afflom/prism-devrel#19, merged:
factoring a long table by nesting depth, at most `MAX_DEPTH` = 12 tests deep;
a claim-id prefix an earlier app of the set holds is lengthened by the next
letters of the name's last word, so the set lists new decisions last and no
existing id moves; requests of up to sixteen fields), plus
`machine.mjs` from afflom/prism-devrel#21 (commit 8bdc082: a branch keeps at
most `MAX_CHAIN` = 10 rule tests), to be repinned to #21's merge commit.

The sixteen-field limit is a patch to prism-code carried by the builder's own
`vendor/prism-code` (see its `VENDOR.md`), offered upstream as
UOR-Foundation/PrismPM#679.

To update: copy `builder/` from that repository at a newer commit, delete
`test.mjs`, record the commit here, and run `python3 -I tools/prompts/gen.py`.
`BS-01` fails until every generated file matches.
