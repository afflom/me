Feature: kappa

  The Prism addresses objects as UOR-Foundation/kappa-registry does
  (feat/rewrite-after-poc, commit 618f477745e601f1bf1bd5cc62aed6fea4c8936d):
  a kappa label is an axis name, a colon and the digest in lowercase hex, on
  one of six axes. The proved Prism Kappa decision reads the label itself;
  the browser only says whether the bytes re-derived to it.

  @KP-01 @build
  Scenario: The Prism reads a kappa label as UOR-Foundation/kappa-registry's Kappa::parse does and admits an object under it only when the proved Prism Kappa decision says admit: a label without its colon, on an unknown axis, of the wrong digit count or not in lowercase hex is refused with its own answer, and bytes that do not re-derive, collide on SHA-1 or could not be re-derived are never admitted
    Given app/specs/kappa/spec.json names kappa-registry's six axes with their wire names, discriminants and digest lengths
    When the browser asks the Prism "kappa <label> <digest>" with digest match, mismatch, uncomputed or collision
    Then the decision answers nocolon, unknownaxis, digits or badhex for a malformed label, in Kappa::parse's order
    And it answers collision or mismatch for bytes that collide or do not re-derive
    And it answers unverified, never admit, for a digest the browser could not re-derive
    And it answers admit with the axis, its discriminant and its digest length only for a well-formed label the bytes re-derived to
    And its eight guarantees are proved with only Quot.sound and propext
    And the compiled guest gives the generated mirror's answer for every label shape on every axis

  @KP-02 @build
  Scenario: The browser re-derives a kappa label's digest only with what its host computes (SHA-256 and SHA-512), names every object on SHA-256 as kappa-registry's mandatory secondary axis, never admits on an axis it cannot compute, and obeys no answer from the guest it does not expect
    Given site/kappa/kappa.mjs and the standalone guest pinned by SHA-256
    When it admits an object under a label
    Then it computes the digest with WebCrypto only on an axis the spec gives a host algorithm
    And a flipped bit is refused as mismatch
    And blake3, sha1, sha3-256 and keccak256 labels answer unverified
    And every admitted object also carries its SHA-256 label
    And an admission whose axis, discriminant or digest length differs from the spec is not obeyed
