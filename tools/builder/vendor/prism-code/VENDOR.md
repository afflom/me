# Vendored prism-code journey

These files are byte copies from the npm package `prism-code` 0.7.2, under its
MIT license (`LICENSE`). The builder imports `spec.mjs`, `session.mjs`,
`render.mjs` and `template.mjs` as they are. It reads `mcp.mjs` only to check
that the `app` input of `prism_prompt` equals the `prism_spec` input that
prism-code declares (register row DR-12).

Tarball `prism-code-0.7.2.tgz`:

- integrity `sha512-2rGX6XqV8zOwExNxoDrOBUbPpOzFsMF1RYxebvKbMKNym7fafh+FWFOfKTyYYn09bH05Q5r/H/Qceb6GbaFItA==`
- shasum `db92c1e3185ba1046d02bcbcbb1069fb45aaf17d`
- sha256 `fe253151c2df716862c0f83014d36b772178300aeda258278b82cccca1725cbc`

SHA-256 of each file, checked by `node builder/test.mjs DR-12`:

| File | SHA-256 |
| --- | --- |
| `src/journey/mcp.mjs` | `4da58794e4f5c1609ffaf2902419cb05300be39a21f69f05f55a64417c002740` |
| `src/journey/render.mjs` | `55f784df40a34f36992cf397c4ff0ba55a5b89b498eca397cd910238e2def64f` |
| `src/journey/session.mjs` | `73b2f266120a52d2951b5973afd664336748bb7c5693748207abcdd6c055a582` |
| `src/journey/spec.mjs` | `80f22a5ddd3f018d3711c067c1a93bd48b9f5627b459dac5710540c83c01104f` |
| `src/journey/template.mjs` | `97885e092443ae6eb46060c976d9c6ee9ca9e138d8914e4f4ae32c0b9dad6ead` |
| `LICENSE` | `93f252866c651e9713b577c6f1d993709311557efe109050252f2fbc48ff0ff8` |
