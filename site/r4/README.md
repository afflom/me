# R4 in the browser (R4-01)

The Prism runs the R4 language model (`casey-allard/lexlean-r4`, wasm engine and
`uor-r4.lut-stack/8` weights) in the owner's browser. Nothing runs on a server and
no remote model is called.

## Size

The engine wasm is 51.7 MB and the weights are 40.1 MB, and one object the page
serves may be at most 16 MiB. `r4.lock.json` names each object by SHA-256 and cuts
it into pieces of 8 MiB, each named by its own SHA-256. `pages.yml` runs
`bootstrap/r4-objects.mjs`, which fetches each object from the pinned upstream
commit, refuses it unless it matches the lock, and writes each piece gzip-compressed
as `objects/<sha256>.gz`. The page serves 13 pieces, 42 MB in all.

The browser (`pieces.mjs`) decompresses each piece with its locked size as a
ceiling, refuses a piece that differs from its fingerprint, joins them, and refuses
the object unless it matches its fingerprint. Matching objects are kept in OPFS by
fingerprint (`store.mjs`), so a later open makes no request.

The upstream wasm also embeds a weight pack of its own (`include_bytes!`). Its
image in the wasm is not byte-for-byte the locked pack, so the locked weights are loaded
explicitly and the engine must report their SHA-256 back. A wasm built without the
embedded pack would be about 11.5 MB, which needs a change upstream.

## Files

| File | What it does |
| --- | --- |
| `r4.lock.json` | every byte R4 runs or loads, with its pieces |
| `pieces.mjs` | fetches one object as pieces and checks every piece and the whole |
| `store.mjs` | OPFS store by fingerprint; re-checks on every read |
| `grant.mjs` | the owner's network grant; the empty grant admits nothing |
| `r4-worker.mjs` | runs the engine in a worker with the network closed |
| `r4.mjs` | `openR4`: moves bytes, asks the decision and the Boundary, returns a receipt |
| `decide.mjs` | asks the compiled Prism R4 decision (`guestDecider`), facet `r4` |
| `receipt.mjs` | one receipt per answer, by mode: compiled, in Prism, routed |

The decision is `app/src/PrismR4.lex.tex`; its seven guarantees are proved with
only `Quot.sound` and `propext`. Acceptance: `node test/r4/run.mjs` in headless
Chromium (13 scenarios, 6 with planted defects).
