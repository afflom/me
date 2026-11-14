Feature: prism_google_link

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides the next stage of the owner's Google connection on one event, so that only the Prism's operator provisions the client, only the owner grants access, a client whose origin drifted from the model is provisioned again, and the kill switch or the owner's forget ends every grant.

  @PGL-01 @build
  Scenario: The app always answers revoked when halted is yes
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PGL-02 @build
  Scenario: The app never answers granted when actor is not owner and stage is registered
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PGL-03 @build
  Scenario: The app never answers granted when actor is not owner and stage is revoked
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PGL-04 @build
  Scenario: The app never answers syncing when actor is operator
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PGL-05 @build
  Scenario: The app never answers syncing when actor is other
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PGL-06 @build
  Scenario: The app never answers granted when stage is unprovisioned
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PGL-07 @build
  Scenario: The app never answers syncing when stage is revoked and actor is prism
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PGL-08 @build
  Scenario: The app never answers syncing when origin is differs
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PGL-09 @build
  Scenario: The app never answers granted when origin is differs
    Given the model in app/src/PrismGoogleLink.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009
