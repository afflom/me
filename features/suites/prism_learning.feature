Feature: prism_learning

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides how one fact about the owner changes when a new signal arrives, so the Prism learns from evidence within fixed bounds and only the owner can confirm or reject a fact.

  @PL-01 @build
  Scenario: The app never answers confirm when signal is not ownerconfirm
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PL-02 @build
  Scenario: The app never answers reject when signal is not ownerreject
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PL-03 @build
  Scenario: The app always answers hold when state is confirmed and signal is not ownerreject
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PL-04 @build
  Scenario: The app always answers hold when state is rejected and signal is not ownerconfirm
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PL-05 @build
  Scenario: The app never answers consolidate when weight is below 10
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PL-06 @build
  Scenario: The app never answers raise when weight is above 14
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PL-07 @build
  Scenario: The app never answers lower when weight is below 2
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PL-08 @build
  Scenario: The app never answers demote when state is not consolidated
    Given the model in app/src/PrismLearning.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008
