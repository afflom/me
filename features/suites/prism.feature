Feature: prism

  The Prism's own application, in app/: one root that routes each request to
  the facet that decides it, and the facets' proved guarantees.

  @PM-01 @build
  Scenario: The Prism answers a request naming a known facet with exactly that facet's decision of the rest, and refuses every other request
    Given the root model in app/src/Prism.lex.tex
    When the Lean kernel checks routesBoundary, routesLearn, routesWhen and refusesUnknownFacet during prismpm verify
    Then a request "<facet> <rest>" is answered by that facet's dispatch of <rest>
    And an unknown facet, an empty rest or an oversized request is answered "invalid request"

  @PM-02 @build
  Scenario: The Boundary denies every move while halted and every move to GitHub or the hosted verifier, never allows detected, restricted or identifying data out, and never sends outbound without the owner's approval
    Given the Boundary model and its proofs in app/src
    When the Lean kernel checks inv001Holds to inv007Holds during prismpm verify
    Then each of the seven guarantees holds for every well-formed request

  @PM-03 @build
  Scenario: Learning confirms or rejects a belief only on the owner's signal, holds a confirmed or rejected belief against every other signal, and never raises a weight above 15 or lowers it below 1
    Given the Learning model and its proofs in app/src
    When the Lean kernel checks inv001Holds to inv008Holds during prismpm verify
    Then each of the eight guarantees holds for every well-formed request

  @PM-04 @build
  Scenario: Chronology never names an Allen relation that the two intervals' endpoints contradict, and never calls two well-formed intervals malformed
    Given the Chronology model and its proofs in app/src
    When the Lean kernel checks inv001Holds to inv008Holds during prismpm verify
    Then each of the eight guarantees holds for every well-formed request
