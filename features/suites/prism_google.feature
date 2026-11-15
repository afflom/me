Feature: prism_google

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether the owner's browser may make one call to the Gmail or Google Calendar API, so that nothing is fetched while the Prism is halted, no other host is ever called, nothing is fetched without a fresh token the owner granted, and nothing is sent or changed without the owner's own act.

  @PGO-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PGO-02 @build
  Scenario: The app always answers refuse when service is other
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PGO-03 @build
  Scenario: The app never answers fetch when method is write and act is none
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PGO-04 @build
  Scenario: The app never answers fetch when token is none
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PGO-05 @build
  Scenario: The app never answers fetch when token is expired
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PGO-06 @build
  Scenario: The app never answers fetch when scope is none
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PGO-07 @build
  Scenario: The app never answers fetch when method is write and scope is readonly
    Given the model in app/src/PrismGoogle.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007
