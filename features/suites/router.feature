Feature: router

  The R4 router maps content coming into the Prism, in the schema it
  arrived in, onto the Prism's own features: when it happens, what it asks
  of the owner, who it is with, what it means, what kind of thing it is,
  and what it is about. Language models are
  compiled into the Prism and declare the features they provide; the
  router decides, value by value and feature by feature, through one proved
  guest, PrismRouter, so the Prism holds the owner's data in its own terms
  with no routing control on the page.

  @RU-01 @build
  Scenario: Every value of incoming content reaches a Prism feature only as PrismRouter answers: the kill switch and bytes that are not the compiled model refuse every mapping, a value the source's schema types is mapped straight and never re-read, the owner's free text is read by every compiled feature, and no feature runs without its compiled model
    Given the PrismRouter module written by tools/facet/gen.py from app/specs/router/spec.json
    When every one of its 720 requests is decided
    Then each answer keeps all thirteen guarantees
    And the Prism root routes "router <request>" to PrismRouter::routerDispatch
    And Lean proves the thirteen guarantees with exactly the axioms Quot.sound and propext

  @RU-02 @build
  Scenario: The owner's words are mapped by the R4 router before they are kept: a jot that names a day and a clock lands once, at that time, in the places its intent and its time name, and nothing reaches the vault while the router refuses
    Given the router's compiled time and intent readers and the root's router facet
    When the owner jots "Call the dentist Friday at 3", and other days, clocks and intents
    Then the jot is a task on that Friday at 3 PM in the tasks and time places only
    And while halted the router refuses and the page keeps nothing
    And the page keeps a jot only after the router has mapped it

  @RU-03 @build
  Scenario: Every item the owner can read is taken apart and labeled through PrismRouter: its parts are the values of its own schema, the readers learn the owner's people and topics in this browser first, and each item carries the kind of thing it is, who it is with and what it is about, or nothing while halted or sealed
    Given an invented mailbox and calendar in the shape real ones arrive in
    When the page reads each item and labels it through the router
    Then every measure of the product record's quality requirements that names the labels suite meets its own threshold
    And a router that hides an item's parts fails the kind measure
    And while halted, or for a sealed item, nothing is labeled
