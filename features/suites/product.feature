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
  Scenario: The product record places every part the Prism has: every surface entry in the person's or the system view, every root facet in the system view serving at least one journey, and every journey with its goal, done-state, usability measure, status and walk; the gate refuses a record that leaves any part unplaced
    Given app/specs/product/spec.json, the surface, the coherence registry and the walks
    When test/product/gate.test.mjs runs tools/product/gate.py on the committed record and on each planted defect
    Then the committed record passes and every planted defect is refused with its reason
