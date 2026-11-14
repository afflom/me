Feature: oracle

  Test content comes from the specifications themselves, never invented: each source is pinned by checksum in app/specs/oracle/spec.json.

  @OR-01 @build
  Scenario: Every example of each specification the oracle pins by checksum, kept only where its addresses are at documentation domains, is read by the Prism as a reference reader written to that specification's own grammar reads it, beyond a debt list that only shrinks; the corpus is re-derived from the pinned sources on every run, and each pinned source is a cited authority whose evidence is this ID
    Given app/specs/oracle/spec.json and the sources it pins by SHA-256
    When tools/oracle/gen.py --check re-derives test/oracle/corpus.json and model/authorities.toml, and test/oracle/*.test.mjs read every example through the Prism
    Then the corpus and the authorities are what the sources give, and every field the reference reader found is what the Prism reads, beyond the listed debt
