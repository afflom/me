Feature: prism_vault_restore

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether bytes read back from the browser vault may be handed out, so that tampered, swapped or unreadable objects are refused and hash-only records never come back as values.

  @PVR-01 @build
  Scenario: The app always answers refuse when address is mismatch
    Given the model in app/src/PrismVaultRestore.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PVR-02 @build
  Scenario: The app always answers refuse when seal is broken
    Given the model in app/src/PrismVaultRestore.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PVR-03 @build
  Scenario: The app always answers refuse when key is missing
    Given the model in app/src/PrismVaultRestore.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PVR-04 @build
  Scenario: The app never answers restore when format is unknown
    Given the model in app/src/PrismVaultRestore.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PVR-05 @build
  Scenario: The app never answers restore when kind is hash
    Given the model in app/src/PrismVaultRestore.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005
