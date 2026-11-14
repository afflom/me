Feature: prism_router

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides, for one value of one piece of content coming into the Prism, whether one feature of the Prism maps it: the R4 router sends each value of the content's own schema through the features compiled into the Prism, so the Prism holds the owner's data in its own terms. A value the source's schema already types is mapped straight, free text is read by every compiled feature, a feature whose compiled model is missing is skipped, bytes that are not the compiled model never touch the owner's data, and the kill switch stops every mapping.

  @PRO-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PRO-02 @build
  Scenario: The app always answers refuse when halted is no and provider is mismatch
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PRO-03 @build
  Scenario: The app never answers map when provider is absent
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PRO-04 @build
  Scenario: The app always answers map when halted is no and provider is compiled and value is text
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PRO-05 @build
  Scenario: The app always answers map when halted is no and provider is compiled and value is subject
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PRO-06 @build
  Scenario: The app never answers map when value is start
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PRO-07 @build
  Scenario: The app never answers map when value is party
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PRO-08 @build
  Scenario: The app always answers direct when halted is no and provider is absent and source is calendar and value is start and feature is time
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PRO-09 @build
  Scenario: The app never answers direct when source is note and value is start
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PRO-10 @build
  Scenario: The app always answers map when halted is no and provider is compiled and value is shape and feature is kind
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PRO-11 @build
  Scenario: The app never answers map when value is shape and feature is topic
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PRO-12 @build
  Scenario: The app never answers direct when value is shape and feature is topic
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PRO-13 @build
  Scenario: The app never answers map when value is shape and feature is party
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013

  @PRO-14 @build
  Scenario: The app never answers direct when value is shape and feature is party
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv014Holds during prismpm verify
    Then no request meets breaksInv014

  @PRO-15 @build
  Scenario: The app always answers map when halted is no and provider is compiled and value is text and feature is topic
    Given the model in app/src/PrismRouter.lex.tex
    When the Lean kernel checks inv015Holds during prismpm verify
    Then no request meets breaksInv015
