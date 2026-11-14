Feature: prism_curate

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one candidate set of a facet's tunable parameters, a deterministic Rule-30 hypothesis or the observer's reconciliation toward the owner, replaces the parameters the facet runs now: adopt it under a new kappa-named claim, recall it under a claim already made, keep what runs, or refuse. A candidate is adopted only with zero humane defects, on the owner's own gestures, without falling below the facet's floor, and only when it Pareto-dominates what runs (a hypothesis) or eases the owner's dismissals (a reconciliation).

  @PC-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PC-02 @build
  Scenario: The app always answers refuse when tunable is no
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PC-03 @build
  Scenario: The app always answers refuse when label is other
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PC-04 @build
  Scenario: The app never answers adopt when defect is some
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PC-05 @build
  Scenario: The app never answers recall when defect is some
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PC-06 @build
  Scenario: The app never answers adopt when evidence is self
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PC-07 @build
  Scenario: The app never answers recall when evidence is self
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PC-08 @build
  Scenario: The app never answers adopt when floor is regressed
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PC-09 @build
  Scenario: The app never answers recall when floor is regressed
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PC-10 @build
  Scenario: The app never answers adopt when move is explore and dominance is equal
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PC-11 @build
  Scenario: The app never answers recall when move is explore and dominance is equal
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PC-12 @build
  Scenario: The app never answers adopt when move is explore and dominance is dominated
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PC-13 @build
  Scenario: The app never answers recall when move is explore and dominance is dominated
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013

  @PC-14 @build
  Scenario: The app never answers adopt when move is explore and dominance is incomparable
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv014Holds during prismpm verify
    Then no request meets breaksInv014

  @PC-15 @build
  Scenario: The app never answers recall when move is explore and dominance is incomparable
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv015Holds during prismpm verify
    Then no request meets breaksInv015

  @PC-16 @build
  Scenario: The app never answers adopt when move is reconcile and eased is no
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv016Holds during prismpm verify
    Then no request meets breaksInv016

  @PC-17 @build
  Scenario: The app never answers recall when move is reconcile and eased is no
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv017Holds during prismpm verify
    Then no request meets breaksInv017

  @PC-18 @build
  Scenario: The app never answers adopt when claim is known
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv018Holds during prismpm verify
    Then no request meets breaksInv018

  @PC-19 @build
  Scenario: The app never answers recall when claim is new
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv019Holds during prismpm verify
    Then no request meets breaksInv019

  @PC-20 @build
  Scenario: The app never answers refuse when halted is no and tunable is yes and label is admit
    Given the model in app/src/PrismCurate.lex.tex
    When the Lean kernel checks inv020Holds during prismpm verify
    Then no request meets breaksInv020
