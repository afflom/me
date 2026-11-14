Feature: prism_models

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one language or reasoning model routed into the Prism from a hub such as Hugging Face may be fetched or run in the owner's browser, so that only a model pinned by revision and hash, in a format with a locked runtime, granted by the owner, runs, and nothing moves while the Prism is halted.

  @PMO-01 @build
  Scenario: The app never answers run when halted is yes
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PMO-02 @build
  Scenario: The app never answers fetch when halted is yes
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PMO-03 @build
  Scenario: The app never answers run when source is unlocked
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PMO-04 @build
  Scenario: The app never answers fetch when source is unlocked
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PMO-05 @build
  Scenario: The app never answers run when route is ungranted
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PMO-06 @build
  Scenario: The app never answers fetch when route is ungranted
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PMO-07 @build
  Scenario: The app never answers run when runtime is not match
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PMO-08 @build
  Scenario: The app never answers run when weights is not match
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PMO-09 @build
  Scenario: The app never answers run when format is other
    Given the model in app/src/PrismModels.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009
