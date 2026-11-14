Feature: prism_holon

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides what the Prism's observer does next for one of its facets, the Prism itself and the owner among them: hold the facet as it is, reconcile it toward the owner, curate it (try a Rule-30 hypothesis), restore its floor, or refuse. The observer turns its attention to the Prism including the owner: it changes a facet only on the owner's own gestures, never on its own measures alone, never while halted, never below the floor, and never for the sake of change when the owner and the Prism agree.

  @PHO-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PHO-02 @build
  Scenario: The app never answers refuse when halted is no
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PHO-03 @build
  Scenario: The app always answers restore when halted is no and floor is regressed
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PHO-04 @build
  Scenario: The app never answers reconcile when signal is self
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PHO-05 @build
  Scenario: The app never answers curate when signal is self
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PHO-06 @build
  Scenario: The app never answers reconcile when tunable is no
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PHO-07 @build
  Scenario: The app never answers curate when tunable is no
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PHO-08 @build
  Scenario: The app always answers reconcile when halted is no and floor is held and signal is owner and tunable is yes and dissonance is high
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PHO-09 @build
  Scenario: The app never answers curate when dissonance is high
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PHO-10 @build
  Scenario: The app never answers reconcile when dissonance is none and kpi is met
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PHO-11 @build
  Scenario: The app never answers curate when dissonance is none and kpi is met
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PHO-12 @build
  Scenario: The app never answers restore when floor is held
    Given the model in app/src/PrismHolon.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012
