# me

A Prism of its owner: one generic app, published to GitHub Pages, that models
a person around "the owner". The app never names anyone. What makes a copy of
it someone's own is the content they give it, and that content exists only in
their browser.

**Live:** https://afflom.github.io/me/

## Three rules

| Rule | What it means here |
| --- | --- |
| Browser only | The app, its storage, its language model and its integrations all run in the visitor's browser. There is no server side and no remote language model. |
| No personal data on GitHub | This repository and its Pages site hold only public structure: the model, its proofs, the holo and the page. Fixtures and examples use synthetic values, and a gate refuses anything else. |
| The model is the authority | Every rule, guarantee and visible word is declared in the LexLean model under `app/src` and proved in Lean 4. The page and its adapters only move bytes. |

## Layout

This repository is an instance of
[UOR-Foundation/template](https://github.com/UOR-Foundation/template) and
follows its contract: [AGENTS.md](AGENTS.md) holds rules R1 to R6, `just vv` is
the whole gate, run in the SDK image `prismpm.lock` pins, and
[CONFORMANCE.md](CONFORMANCE.md) is generated from `model/`.

| Path | Holds |
| --- | --- |
| `app/` | The LexLean project: the model, its facets and its proofs |
| `model/` | The register of capabilities, claims and authorities |
| `site/` | The page that loads, verifies and runs the holo in the browser |
| `frame/`, `identity/` | The shared Prism frame and accounts, pinned by `frame.lock` |

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
