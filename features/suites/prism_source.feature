Feature: prism_source

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether the owner's browser may read one declared service by one route, so that every service the owner uses arrives through the same three browser routes (what the service's web app shows the owner, the service's own pages with the owner's own sign-in, and the service's own data download), nothing is read while the Prism is halted, nothing is ever written to a service, an undeclared service is never read, and no service's private interface is used.

  @PS-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PS-02 @build
  Scenario: The app always answers refuse when act is write
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PS-03 @build
  Scenario: The app never answers read when service is other
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PS-04 @build
  Scenario: The app never answers read when service is whatsapp and route is own
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PS-05 @build
  Scenario: The app never answers read when service is discord and route is own
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PS-06 @build
  Scenario: The app never answers read when service is linkedin and route is own
    Given the model in app/src/PrismSource.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006
