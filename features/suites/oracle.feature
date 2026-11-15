Feature: oracle

  Test content comes from the specifications themselves, never invented: each source is pinned by checksum in app/specs/oracle/spec.json.

  @OR-01 @build
  Scenario: Every example of each specification the oracle pins by checksum, kept only where its addresses are at documentation domains, is read by the Prism as a reference reader written to that specification's own grammar reads it, beyond a debt list that only shrinks; the corpus is re-derived from the pinned sources on every run, and each pinned source is a cited authority whose evidence is this ID
    Given app/specs/oracle/spec.json and the sources it pins by SHA-256
    When tools/oracle/gen.py --check re-derives test/oracle/corpus.json and model/authorities.toml, and test/oracle/*.test.mjs read every example through the Prism
    Then the corpus and the authorities are what the sources give, and every field the reference reader found is what the Prism reads, beyond the listed debt

  @VC-01 @build
  Scenario: vCard is read as RFC 6350 defines it: the page's property table is derived from the RFC's own ABNF, every RFC 6350 entry of IANA's vCard Elements registry is implemented and exercised by an example line the RFC gives (or one derived from the RFC's own example of a property it applies to), the Prism reads each example line as a reference reader written to RFC 6350 sections 3.3 and 3.4 reads it, and an entry neither met nor in a debt that only shrinks fails the build
    Given RFC 6350 and IANA's vCard Elements registry, pinned by SHA-256 in app/specs/oracle/vcard.json
    When tools/oracle/vcard.py --check re-derives site/read/vcard.table.mjs and test/oracle/vcard.json, and test/oracle/vcard.test.mjs reads every example line through site/read/vcard.mjs
    Then every registry entry is implemented and exercised or in the debt with a reason, and every line reads as the reference reader reads it; a planted blind reader and a planted dropped property are refused
