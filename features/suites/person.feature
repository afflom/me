Feature: person

  The whole-person model is WHO's International Classification of Functioning, Disability and Health (ICF), pinned by checksum in app/specs/oracle/spec.json and generated in full into the page.

  @WP-01 @build
  Scenario: The whole-person model is every entity of WHO's ICF release pinned by checksum, with its code, title and URI as WHO publishes it: both forms of the release agree field by field, the classification holds to its own structure (components, levels, codes, leaves, residuals), the page's module is re-derived from the release on every run, and each check refuses its planted defect
    Given the ICF release and its licence terms that app/specs/oracle/spec.json pins by SHA-256
    When tools/person/gen.py --check reads the release's tabulation and workbook and re-derives site/person/icf.mjs, and test/person/icf.test.mjs plants each defect in the release
    Then the two forms agree, the classification has the ICF's structure, the model is current with every entity's code, title and URI, and every planted defect is refused with its diagnostic
