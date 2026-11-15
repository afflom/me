Feature: product

  The Prism as a product for the person who owns it: the person's view kept
  apart from the system view, the journeys the person makes with their
  done-states and usability measures, after afflom/prism-devrel's Architecture,
  Users and Features, in app/specs/product/spec.json. A journey is grown as a
  thin working slice and, once it works, is held by every change and deploy.

  @PD-01 @build
  Scenario: Every journey of the product record is walked by a synthetic person whose device holds a day of mail and calendar: a journey recorded as working passes in a fresh and a returning browser on every pull request and on the published page, and a journey that passes while recorded as not yet fails until the record says it works
    Given the assembled page, or the published one, and a synthetic person's device answering as their installed extension does, with today's meeting, a flight, a question from Robin, a request to meet from Sam and a bill due
    When test/product/journeys.test.mjs walks each journey by what the person sees and the names of what they press
    Then every journey recorded as works meets its done-state fresh and after a reload, no journey meets it while recorded as not yet, and the scoreboard is written to the job summary

  @PD-02 @build
  Scenario: No word or control the product record assigns to the system view is on the screen, in any place, fresh, returning, or with the person's day arrived and an item opened, beyond the debt the record lists; a word not listed fails, and a listed word that no longer shows fails until it is removed, so the debt only shrinks
    Given the system view's words from the surface entries the product record assigns to it and its machinery terms
    When test/product/screen.test.mjs opens every place in a fresh profile, again after a reload, and again with the synthetic person's day arrived, opening each place's first item
    Then the system words shown are exactly the listed debt

  @PD-03 @build
  Scenario: The product record places every part the Prism has: every surface entry in the person's or the system view, every root facet in the system view serving at least one journey, every journey with its goal, done-state, usability measure, status and walk, and every setting in the person's view one the Prism requires of the person; the gate refuses a record that leaves any part unplaced
    Given app/specs/product/spec.json, the surface, the coherence registry and the walks
    When tools/generators/run.sh runs the LexLean program generators/product over them, and GN-01 replays each planted defect in generators/product/cases
    Then the committed record passes and every planted defect is refused with its reason

  @PT-01 @build
  Scenario: Every part of the Prism, each module of its page and of its model, answers what it is, why it is there, who acts in it, where it runs, when it acts and how it is checked, each answer derived from the record and grounded in a stratum of app/specs/parts/spec.json after verdant's W5H certificate; why traces each part through the features, facets and journeys it serves to the stakeholder concerns they answer, and the gate refuses an ungrounded part, an unanswered question, a concern no journey answers or a working journey no part serves, beyond a debt that only shrinks
    Given every tracked module of the page and of the model, the parts record, the product record and the coherence registry
    When test/parts/gate.test.mjs runs tools/parts/gate.py on the committed record and on each planted defect, with the suites that reach each part from test/parts/reach.txt, which the LexLean program generators/parts writes
    Then the committed record passes and every planted defect is refused with its reason
