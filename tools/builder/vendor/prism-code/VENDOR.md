# Vendored prism-code journey

These files are byte copies from the npm package `prism-code` 0.7.2, under its
MIT license (`LICENSE`), with one patch recorded in `upstream.toml`
(`prism-code-wide-requests`): a request has at most sixteen fields, not eight
(`spec.mjs` refuses past sixteen, `render.mjs` reserves `decodeField1` to
`decodeField16`, and `mcp.mjs` declares `maxItems: 16`). The builder imports `spec.mjs`, `session.mjs`,
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
| `src/journey/mcp.mjs` | `fc21ba9d27eb3b7bb1f41a41007cd1111b2e4c8bed908a5c47fc1cbbd7e6b8eb` |
| `src/journey/render.mjs` | `af7e2abc99139eb4c5fa64eb69d1e1ba51483588e2f05091f6a3f01c6ffd186a` |
| `src/journey/session.mjs` | `73b2f266120a52d2951b5973afd664336748bb7c5693748207abcdd6c055a582` |
| `src/journey/spec.mjs` | `dd1e437a4ccc8c94c246b97015e6ab2b313e9b7a7a10c72ca0207b1633eebf68` |
| `src/journey/template.mjs` | `97885e092443ae6eb46060c976d9c6ee9ca9e138d8914e4f4ae32c0b9dad6ead` |
| `LICENSE` | `93f252866c651e9713b577c6f1d993709311557efe109050252f2fbc48ff0ff8` |
