Feature: page

  The Prism's own surface in site/card.*: the owner's controls, wired only to
  the verified app guest, the vault and R4.

  @PG-01 @build
  Scenario: The page keeps, reads and answers only through the verified app: a fact is kept only when the Boundary and the vault allow it, nothing is kept while halted, and every check is the root's own answer
    Given the assembled page with the verified app.holo
    When test/page/card.test.mjs keeps a fact, halts, keeps another and checks two requests in headless Chromium
    Then the first fact is kept, the second is refused while halted, a move to GitHub is denied and two meeting intervals answer meets
    And crates/conformance/tests/page.rs holds every decision in site/card.mjs to the app guest
