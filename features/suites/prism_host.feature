Feature: prism_host

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides how the owner's browser uses each surface it reports as a route for the owner's own content, so that every surface the browser exposes is used, nothing is used while the Prism is halted, nothing the owner holds is read without the owner's act or a grant the browser keeps, a live account on another origin is named sealed to the page itself, and is read only through the extension the owner installed.

  @PH-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PH-02 @build
  Scenario: The app never answers use when surface is mail
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PH-03 @build
  Scenario: The app never answers use when surface is calendar
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PH-04 @build
  Scenario: The app never answers use when present is no
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PH-05 @build
  Scenario: The app never answers offer when present is no
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PH-06 @build
  Scenario: The app never answers use when act is none and grant is none and surface is folder
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PH-07 @build
  Scenario: The app never answers use when act is none and surface is contacts
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PH-08 @build
  Scenario: The app never answers use when act is none and surface is paste
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PH-09 @build
  Scenario: The app never answers use when act is none and surface is files
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PH-10 @build
  Scenario: The app never answers use when act is none and surface is drop
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PH-11 @build
  Scenario: The app never answers use when act is none and grant is none and surface is extension
    Given the model in app/src/PrismHost.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011
