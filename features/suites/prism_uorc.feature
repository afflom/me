Feature: prism_uorc

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one object may be kept in, or opened from, the owner's browser as a UORC archive (UOR-Foundation/compression): the archive is the object's reference, a lossless executable structure sealed by UORC-SHA256-CHAIN-v1, named by the kappa label of the bytes it restores. The decision reads only the archive's structure (its seal, format, scope, object count, whether it restored to the very bytes its label names, and the kappa facet's answer), never the content: values are projected only when the decision says open.

  @PU-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PU-02 @build
  Scenario: The app always answers refuse when seal is broken
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PU-03 @build
  Scenario: The app always answers refuse when format is other
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PU-04 @build
  Scenario: The app always answers refuse when scope is other
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PU-05 @build
  Scenario: The app always answers refuse when objects is many
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PU-06 @build
  Scenario: The app always answers refuse when restore is differs
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PU-07 @build
  Scenario: The app always answers refuse when restore is failed
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PU-08 @build
  Scenario: The app always answers refuse when kappa is other
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PU-09 @build
  Scenario: The app never answers open when act is keep
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PU-10 @build
  Scenario: The app never answers keep when act is open
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PU-11 @build
  Scenario: The app always answers keep when act is keep and halted is no and seal is ok and format is known and scope is standard and objects is one and restore is same and kappa is admit
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PU-12 @build
  Scenario: The app always answers open when act is open and halted is no and seal is ok and format is known and scope is standard and objects is one and restore is same and kappa is admit
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PU-13 @build
  Scenario: The app always answers keep when act is keep and halted is no and seal is ok and format is known and scope is self and objects is one and restore is same and kappa is admit
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013

  @PU-14 @build
  Scenario: The app always answers open when act is open and halted is no and seal is ok and format is known and scope is self and objects is one and restore is same and kappa is admit
    Given the model in app/src/PrismUorc.lex.tex
    When the Lean kernel checks inv014Holds during prismpm verify
    Then no request meets breaksInv014
