Feature: prism_vault_store

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether the browser vault may keep one value, as its value or as a hash only, so that nothing is kept that the Boundary refused, that the owner has not yet approved, or that does not re-derive to the address it is filed under.

  @PVS-01 @build
  Scenario: The app always answers refuse when address is mismatch
    Given the model in app/src/PrismVaultStore.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PVS-02 @build
  Scenario: The app always answers refuse when boundary is deny
    Given the model in app/src/PrismVaultStore.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PVS-03 @build
  Scenario: The app never answers store when boundary is hashonly
    Given the model in app/src/PrismVaultStore.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PVS-04 @build
  Scenario: The app never answers store when key is missing
    Given the model in app/src/PrismVaultStore.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PVS-05 @build
  Scenario: The app never answers store when boundary is ask
    Given the model in app/src/PrismVaultStore.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005
