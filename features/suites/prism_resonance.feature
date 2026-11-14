Feature: prism_resonance

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides how the Prism answers one gesture of the owner toward one thing it holds: it rests, it whispers, it chimes once, it blooms (the thing comes forward), it gathers a chorus (what belongs with it comes forward too), or it recedes. Stillness is answered with stillness, a dismissal is honored at once, a hurried owner is never met with more, the owner's quiet is kept, and nothing the owner rejected is ever brought forward.

  @PRE-01 @build
  Scenario: The app always answers rest when halted is yes
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PRE-02 @build
  Scenario: The app always answers recede when halted is no and gesture is dismiss
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PRE-03 @build
  Scenario: The app always answers rest when gesture is still
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PRE-04 @build
  Scenario: The app never answers chime when attention is quiet
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PRE-05 @build
  Scenario: The app never answers bloom when attention is quiet
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PRE-06 @build
  Scenario: The app never answers chorus when attention is quiet
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PRE-07 @build
  Scenario: The app never answers bloom when belief is rejected
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PRE-08 @build
  Scenario: The app never answers chorus when belief is rejected
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PRE-09 @build
  Scenario: The app never answers bloom when pace is hurried
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PRE-10 @build
  Scenario: The app never answers chorus when pace is hurried
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PRE-11 @build
  Scenario: The app never answers chorus when belief is inferred
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PRE-12 @build
  Scenario: The app never answers bloom when salience is far and gesture is dwell
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PRE-13 @build
  Scenario: The app never answers chorus when salience is far and gesture is dwell
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013

  @PRE-14 @build
  Scenario: The app never answers bloom when gesture is open
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv014Holds during prismpm verify
    Then no request meets breaksInv014

  @PRE-15 @build
  Scenario: The app never answers chorus when gesture is open
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv015Holds during prismpm verify
    Then no request meets breaksInv015

  @PRE-16 @build
  Scenario: The app never answers chime when phase is night and gesture is open
    Given the model in app/src/PrismResonance.lex.tex
    When the Lean kernel checks inv016Holds during prismpm verify
    Then no request meets breaksInv016
