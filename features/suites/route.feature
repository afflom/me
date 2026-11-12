Feature: route

  Any content, from any source, is routed onto the model's features by its
  schema.org type and its media alone. The Lean model holds the registers as
  indices; the page reads their names from one generated register, so the two
  must agree row for row.

  @RT-01 @build
  Scenario: The vocabulary register the page reads lists schema.org 30.1's 939 types and 1,538 properties, the 12 domains and the 1,229 crosswalk rows in the order of the Lean indices, every source pinned by sha256
    Given site/vocab/register.json and the Lean registers in app/src/Foundation/Vocab/V1
    When the register check reads both
    Then each type, property and crosswalk row on the page matches the Lean row at the same index, with the same parents, domains, ranges, status and target
    And the 12 domain keys are the design model's, in its order
    And every one of the 13 sources is pinned by a sha256
    And a register with one type renamed is refused
