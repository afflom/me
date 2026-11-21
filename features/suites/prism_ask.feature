Feature: prism_ask

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides what the Prism does with words the owner says to it: tell the time, answer from what is held, take feedback as heard, offer to keep them where they land in time, or look for them in what is held and offer to keep them, and nothing while the Prism is paused.

  @PA-01 @build
  Scenario: The app always answers paused when halted is yes
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PA-02 @build
  Scenario: The app never answers keep when intent is question
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PA-03 @build
  Scenario: The app never answers keep when box is asks
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PA-04 @build
  Scenario: The app never answers look when box is asks
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PA-05 @build
  Scenario: The app never answers answer when held is none
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PA-06 @build
  Scenario: The app never answers look when held is none
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PA-07 @build
  Scenario: The app always answers keep when halted is no and clock is not and box is keeps and timed is yes and intent is task
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PA-08 @build
  Scenario: The app never answers heard when intent is question
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PA-09 @build
  Scenario: The app never answers heard when act is task
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PA-10 @build
  Scenario: The app never answers heard when timed is yes
    Given the model in app/src/PrismAsk.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010
