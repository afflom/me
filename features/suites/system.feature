Feature: system

  The Prism is one system, a digital twin of one person that is also their personal agent, and its model says so: an OPM system diagram at the top of its architecture description, from which its parts and their decisions follow.

  @SY-01 @build
  Scenario: The Prism is modeled as one system (app/specs/system, written into app/src/PrismSystem): its OPM system diagram names the main process, the person as agent and the two states of the attribute it changes, the instrument, input and result, and zooms into the parts; every decision is one part's, a part no decision realizes is on an owed list that only shrinks, and every standard the system answers to is in the standards register with an evidenced obligation
    Given app/specs/system/spec.json, the decisions app/prompts/set.json lists and the standards register
    When tools/system/gen.py --check writes app/src/PrismSystem.lex.tex from them, which prismpm check holds to the system model
    Then the module is current, every decision is exactly one part's, every part holds a decision or says what it owes, the owed parts are no more than before, and every standard is registered
