Feature: realize

  The Prism's realizability: the spec of every facet is realized by the
  runtime, with nothing left over. A field that changes no answer, a rule that
  decides nothing no other rule would, or a setting that drives nothing is a
  static stub, and the Prism refuses it. The model is
  app/specs/realizability/spec.json; tools/realize/gate.py reads it with every
  facet spec and writes PrismRealizability, which the Lean kernel checks
  against the very judges the holo is compiled from.

  @RZ-01 @build
  Scenario: Every Prism setting does something: every field of every facet spec changes some answer, every rule decides a request no other rule would, every setting drives such a field, and every facet carries a complete eleven-element descriptor, with every witness pair answered by the facet judge as its spec says
    Given every app/specs/*/spec.json is named in app/specs/realizability/spec.json, and every facet the root routes has a spec
    When tools/realize/gate.py --check reads them
    Then every field has a witness pair: two requests that differ in that field alone and get different answers
    And every rule changes some answer when removed, every tree leaf is reached, and every request gets one of the outcomes
    And every example is answered as it says, and every field read from another facet takes exactly that facet's outcomes
    And every setting of the surface drives a field that has a witness pair
    And every facet's descriptor has its eleven elements complete: identity, vocabulary, capability, interface, composition, dynamics, fidelity, resources, authority, evidence and projection
    And PrismRealizabilityProofs proves, by reflexivity with no axioms, that every descriptor is complete and that the facet's judge gives each witness pair the two answers its spec gives
