Feature: uorc

  The Prism runs over UORC (UOR-Foundation/compression) as its kappa: every
  value it keeps is a uorc archive, the value's lossless executable reference
  with a UORC-SHA256-CHAIN-v1 seal over itself, named by the kappa label of the
  bytes it restores. The proved Prism UORC decision reads only the archive's
  structure; the value is projected only when it answers open.

  @UO-01 @build
  Scenario: The Prism keeps or opens an object as a UORC archive only when the proved Prism UORC decision says so, from the archive's structure alone: never while halted, never with a broken seal, an unknown format, a basis the browser does not hold or more than one object, never when it does not restore within the work bound to the very bytes its kappa label names, and never for an object the kappa facet did not admit
    Given app/specs/uorc/spec.json is the single source of the decision
    When the browser asks the Prism "uorc <act> <halted> <seal> <format> <scope> <objects> <restore> <kappa>"
    Then it answers keep only for act keep and open only for act open
    And it refuses while halted, on a broken seal, an unknown format, another basis, several objects, a restore that differs or fails, or an object the kappa facet did not admit
    And its fourteen guarantees are proved with only Quot.sound and propext
    And the compiled guest gives the generated mirror's answer for all 576 requests

  @UO-02 @build
  Scenario: The page runs only the uorc client of UOR-Foundation/compression release v0.4.0, fetched from the release asset pinned by SHA-256 with each served file pinned again by SHA-256 and size, checked in the browser before it compiles, and loaded only when a value is first kept or opened
    Given site/uorc/uorc.lock.json pins the release asset and each file it serves
    When pages.yml runs bootstrap/uorc-objects.mjs
    Then an asset or file that does not re-derive to its fingerprint fails the build
    And the browser refuses client bytes that differ from the lock before it compiles them
    And the page imports the client only when the vault first keeps or opens a value

  @UO-03 @build
  Scenario: The vault keeps every value as its uorc archive, sealed under the device key with the value's kappa label in its record and filed under the value's own keyed address, and gives a value back only when the archive opens through the proved decisions to bytes that re-derive to that address
    Given the page opens the vault with the Prism's objects
    When the owner keeps a value
    Then the vault seals its uorc archive, not the value, with the value's kappa label in the record
    And it files the record under the value's keyed address
    And it restores the value only when the archive opens to bytes that re-derive to that address
    And a vault without the objects never opens an archive record
