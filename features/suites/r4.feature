Feature: r4

  The Prism runs the R4 language model (casey-allard/lexlean-r4) in the
  owner's browser. Its engine and weights are public bytes pinned by SHA-256;
  each is larger than one served object may be, so the page serves them in
  pieces. Whether an answer may be shown is decided by the proved Prism R4
  decision and the Boundary, never by the adapter.

  @R4-01 @build
  Scenario: The R4 language model runs in the browser only from bytes that re-derive to their pinned SHA-256, served by the page in pieces of at most 16 MiB, and shows an answer only when the proved Prism R4 decision allows it
    Given site/r4/r4.lock.json names the engine glue, the engine wasm and the weights by SHA-256, from one pinned upstream commit
    And each is cut into pieces of at most 8 MiB, each piece named by its own SHA-256, under a 16 MiB limit
    When pages.yml fetches each object from that commit and writes its pieces into the page
    Then an object or piece that does not re-derive to its fingerprint fails the build
    And the browser refuses a piece that differs from its fingerprint or inflates past its locked size
    And the browser refuses a joined object that differs from its fingerprint, and keeps only matching objects in OPFS
    And a mirror is fetched from only when the owner's grant admits it
    And the Prism R4 decision refuses an answer from a wrong engine, wrong or missing weights, or mixed model modes
    And its seven guarantees are proved with only Quot.sound and propext
    And without the decision or the Boundary nothing is shown
