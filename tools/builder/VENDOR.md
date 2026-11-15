# The Prism-DevRel builder, vendored

`tools/builder/` is `builder/` of [afflom/prism-devrel](https://github.com/afflom/prism-devrel)
without its own test file, copied unchanged so `tools/prompts/gen.py` runs it
with no network. Source: `main` at merge commit
`f8c0300a2c938691d08ede68a21b238e9ed9b994` (afflom/prism-devrel#21, merged on
top of #19: a deep table is factored by choice fields, or by how a pair of
number fields stands, until no path nests past `MAX_DEPTH` = 12 ifs and no
branch keeps more than `MAX_CHAIN` = 10 rule tests; a claim-id prefix an
earlier app of the set holds is lengthened by the next letters of the name's
last word, so the set lists new decisions last and no existing id moves;
requests of up to sixteen fields).

The sixteen-field limit is a patch to prism-code carried by the builder's own
`vendor/prism-code` (see its `VENDOR.md`), offered upstream as
UOR-Foundation/PrismPM#679.

To update: copy `builder/` from that repository at a newer commit, delete
`test.mjs`, record the commit here, and run `python3 -I tools/prompts/gen.py`.
`BS-01` fails until every generated file matches.
