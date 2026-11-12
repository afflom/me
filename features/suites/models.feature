Feature: models

  The Prism routes language and reasoning models from hubs such as Hugging
  Face into the owner's browser. Each model is pinned by hub commit, written
  in a standard format (ONNX, GGUF) with a runtime pinned by package version
  and integrity, and every byte is named by SHA-256 and served by the page in
  pieces. Whether a model may be fetched or run is decided by the proved Prism
  Models decision; whether its answer may be shown is decided by R4's routed
  mode and the Boundary, never by the adapter.

  @MD-01 @build
  Scenario: A language or reasoning model routed into the Prism runs in the browser only when the proved Prism Models decision says run: pinned by hub commit and SHA-256, in a format with a locked runtime, granted by the owner, and not halted; its answer is shown only through R4's routed mode and the Boundary
    Given site/models/models.lock.json pins each model to a Hugging Face commit and each runtime to an npm version and its sha512 integrity
    And every file is named by SHA-256 and cut into pieces of at most 8 MiB under a 16 MiB limit
    When pages.yml fetches each file from its pinned source and writes its pieces into the page
    Then a file or piece that does not re-derive to its fingerprint fails the build
    And the browser asks the Prism Models decision "source format runtime weights route halted" before it fetches or runs anything
    And it fetches only on fetch, loads only on run, and asks the decision again before every call
    And the model worker closes the network and serves the runtime only locked, verified bytes
    And the decision never runs or fetches while halted, for an unpinned model, or for a model the owner did not grant
    And it never runs on runtime or weights that differ from the lock, or on a format without a locked runtime
    And its nine guarantees are proved with only Quot.sound and propext
    And a routed answer is shown only through R4's routed mode and the Boundary
