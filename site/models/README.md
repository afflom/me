# Models routed into the Prism (MD-01)

The Prism routes language and reasoning models from hubs such as Hugging Face
into the owner's browser and runs them there. No remote model is called and no
server runs anything: the bytes are pinned, served by this page, checked, kept
in the browser and run in a worker with the network closed.

This is the third of the Prism's three model modes, kept apart from the other two:

| Mode | What it is | Where |
| --- | --- | --- |
| compiled with Prism | a model compiled into the holo | `r4.registerCompiled` |
| a model in Prism | R4's own weights, run by R4's engine | `site/r4` |
| **routed by R4** | another model, here an ONNX model from Hugging Face | `site/models` + `r4.askRouted` |

## How a model gets in

1. **Pinned.** `models.lock.json` names each model by hub repository and commit,
   its format (ONNX; GGUF has its place in the decision and the lock), its task,
   and every file it loads by SHA-256. Each format's runtime is pinned by npm
   package version and its sha512 registry integrity, and each runtime file by SHA-256.
2. **Served.** `pages.yml` runs `bootstrap/model-objects.mjs`, which fetches each
   file from its pinned source, refuses anything that does not re-derive to its
   fingerprint, and writes it as gzip pieces of at most 8 MiB named by SHA-256
   (one served object may be at most 16 MiB). Today: 11 files, 32 pieces, 118 MB.
3. **Decided.** Before anything moves, `models.mjs` asks the Prism root's `model`
   facet, the proved Prism Models decision (`app/src/PrismModels.lex.tex`):
   `source format runtime weights route halted` gives `run`, `fetch`, `ask` or
   `refuse`. It fetches only on `fetch`, loads only on `run`, and asks again before
   every call, so a halt or a withdrawn grant stops the next one.
4. **Kept.** Each file is kept in OPFS by fingerprint (the R4 store) and re-checked
   on every read; a changed file is refused, removed and fetched again.
5. **Run.** `model-worker.mjs` checks every file again, closes `fetch`, XHR,
   WebSocket and `importScripts`, and loads the runtime from those bytes. The runtime
   asks for model files by their hub URL; the worker answers only with locked,
   verified bytes and 404 for anything else. ONNX Runtime's default CDN paths are
   removed, so its bundled factory runs on the verified wasm.
6. **Shown.** A routed answer is shown only through R4's routed mode and the
   Boundary, with a receipt naming R4 as router, the target model and its hub commit.

The owner routes a model with one press ("Route into my Prism"); the grant is kept
on this device. Nothing is routed by default: the empty grant makes the decision ask.

## Guarantees (proved, `[Quot.sound, propext]` only)

Never run or fetch while halted; never run or fetch a model that is not pinned;
never run or fetch a model the owner did not grant; never run on runtime or
weights that differ from the lock; never run a format without a locked runtime.

## Models today

| Model | Task | Source |
| --- | --- | --- |
| SmolLM2 135M Instruct (int8 ONNX, 137 MB) | text generation: turns the owner's sources into words | `HuggingFaceTB/SmolLM2-135M-Instruct` @ `12fd25f` |
| all-MiniLM-L6-v2 (int8 ONNX, 23 MB) | feature extraction: puts content near related content | `Xenova/all-MiniLM-L6-v2` @ `751bff3` |

Runtime: `@huggingface/transformers` 4.3.1 with `onnxruntime-web`
1.31.0-dev.20260914 (wasm, one thread; Pages cannot send the headers threads need).

To add a model: add its entry to the lock (hub, commit, files), run
`node bootstrap/model-objects.mjs site --write-lock`, then the acceptance test.

## Acceptance

    node bootstrap/r4-objects.mjs site && node bootstrap/model-objects.mjs site
    PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node test/models/run.mjs

12 scenarios in headless Chromium, 5 of them planted defects (tampered OPFS bytes,
flipped bytes in transit, an unpinned revision or file or unknown format, no decision).
