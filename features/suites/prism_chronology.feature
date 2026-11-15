Feature: prism_chronology

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides how two time intervals relate, as one of Allen's thirteen interval relations, so the Prism can order events and find schedule conflicts exactly.

  @PCH-01 @build
  Scenario: The app never answers malformed when astart is below aend and bstart is below bend
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PCH-02 @build
  Scenario: The app never answers before when aend is at least bstart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PCH-03 @build
  Scenario: The app never answers after when bend is at least astart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PCH-04 @build
  Scenario: The app never answers equals when astart differs from bstart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PCH-05 @build
  Scenario: The app never answers equals when aend differs from bend
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PCH-06 @build
  Scenario: The app never answers meets when aend differs from bstart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PCH-07 @build
  Scenario: The app never answers during when astart is at most bstart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PCH-08 @build
  Scenario: The app never answers overlaps when aend is below bstart
    Given the model in app/src/PrismChronology.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008
