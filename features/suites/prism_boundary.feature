Feature: prism_boundary

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one labeled fact about the owner may go to a destination, so that nothing moves while the Prism is halted, no personal fact is ever saved to GitHub or the hosted verifier, no personal identifier leaves the browser, and nothing is sent without the owner's signed approval.

  @PB-01 @build
  Scenario: The app always answers deny when halted is yes
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PB-02 @build
  Scenario: The app always answers deny when destination is github
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PB-03 @build
  Scenario: The app always answers deny when destination is verifier
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PB-04 @build
  Scenario: The app never answers allow when detector is not none
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PB-05 @build
  Scenario: The app never answers allow when label is restricted
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PB-06 @build
  Scenario: The app never answers allow when destination is outbound and approval is none
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PB-07 @build
  Scenario: The app never answers allow when identifier is yes and destination is not browser
    Given the model in app/src/PrismBoundary.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007
