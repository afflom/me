Feature: prism_dest

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides where one thing the Prism holds may go next: shown to the owner, held quietly for the owner, prepared as a draft for the owner to act on, delivered to a destination (calendar, mail, another platform), or refused. Nothing leaves without the owner's own act on the very bytes they saw, nothing coercive is ever carried or pushed, nothing without a cause is routed, restricted content never leaves, and the owner's quiet is kept.

  @PDE-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PDE-02 @build
  Scenario: The app always answers refuse when target is other
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PDE-03 @build
  Scenario: The app always answers refuse when cause is orphan
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PDE-04 @build
  Scenario: The app always answers refuse when verdict is deny
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PDE-05 @build
  Scenario: The app never answers deliver when act is none
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PDE-06 @build
  Scenario: The app never answers deliver when wording is changed
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PDE-07 @build
  Scenario: The app never answers deliver when tone is coercive
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PDE-08 @build
  Scenario: The app never answers show when tone is coercive
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PDE-09 @build
  Scenario: The app never answers deliver when verdict is hashonly
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PDE-10 @build
  Scenario: The app never answers draft when verdict is hashonly
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PDE-11 @build
  Scenario: The app never answers deliver when target is owner
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PDE-12 @build
  Scenario: The app never answers draft when target is owner
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PDE-13 @build
  Scenario: The app never answers show when pace is quiet and urgency is normal
    Given the model in app/src/PrismDest.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013
