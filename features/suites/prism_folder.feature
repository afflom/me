Feature: prism_folder

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether the owner's browser may read one file from a folder or file the owner granted on their device, so that nothing is read while the Prism is halted, nothing is read without the owner's grant, nothing is ever written to the device, and only standard mail, calendar and contact formats are read.

  @PF-01 @build
  Scenario: The app always answers refuse when halted is yes
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PF-02 @build
  Scenario: The app always answers refuse when action is write
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PF-03 @build
  Scenario: The app never answers read when grant is none
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PF-04 @build
  Scenario: The app never answers read when grant is prompt
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PF-05 @build
  Scenario: The app never answers read when grant is revoked
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PF-06 @build
  Scenario: The app never answers read when format is other and action is read
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PF-07 @build
  Scenario: The app never answers read when bulk is large and action is read
    Given the model in app/src/PrismFolder.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007
