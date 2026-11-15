Feature: prism_r4

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one model answer may be shown in the Prism, so that wrong engine or weight bytes are refused, the three model modes (compiled with Prism, a model in Prism, models routed by R4) never mix, a routed answer needs a granted route, and nothing is shown without the Boundary's allow.

  @PR-01 @build
  Scenario: The app never answers answer when weights is mismatch
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PR-02 @build
  Scenario: The app never answers answer when engine is not match
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PR-03 @build
  Scenario: The app never answers answer when mode is routed and route is not granted
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PR-04 @build
  Scenario: The app never answers answer when mode is compiled and weights is not none
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PR-05 @build
  Scenario: The app never answers answer when mode is inprism and weights is not match
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PR-06 @build
  Scenario: The app never answers answer when mode is not routed and route is not none
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PR-07 @build
  Scenario: The app never answers answer when boundary is not allow
    Given the model in app/src/PrismR4.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007
