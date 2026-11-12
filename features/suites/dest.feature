Feature: dest

  The Prism routes its sources in and routes itself out: to the owner's own
  view, and to the places the owner acts in (their calendar, a mail reply,
  another platform). One proved guest, PrismDest, decides where one item may
  go next: deliver, draft, show, hold or refuse. Its guarantees follow the
  Vedanta and Dharma models of afflom/verdant-resonance: no acausal routes
  (Pratityasamutpada), no coercion of the owner or of a correspondent
  (Ahimsa), no drift between what is seen and what is sent (Satya),
  restricted content never leaves (Aparigraha), and quiet is kept (Turiya).

  @DS-01 @build
  Scenario: The Prism routes an item to a destination only as PrismDest answers: nothing leaves without the owner's act on the very words they saw, nothing coercive is carried out or pushed into the owner's view, nothing without a cause is routed, restricted content never leaves, quiet is kept, and the kill switch stops every route
    Given the PrismDest guest built from app/src/PrismDest.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 2560 requests is decided
    Then each answer is the generated decision table's answer and keeps all eleven guarantees
    And the Prism root routes "dest <request>" to PrismDest::destDispatch
    And Lean proves the eleven guarantees with exactly the axioms Quot.sound and propext

  @DS-02 @build
  Scenario: The page hands an item to the owner's calendar, mail or another platform only after the Boundary and PrismDest answer deliver for the owner's press, through an app the owner already uses, with no host called and no setup
    Given a reply, an event and a note for the owner, and a recorder in place of the hand-off
    When the Prism prepares each and the owner presses Send
    Then the Prism alone only drafts, and the owner's press on the seen words delivers one RFC 5322 reply or one iCalendar event
    And changed or coercive words, an item with no cause, restricted content, an unmodeled destination and the kill switch never reach the hand-off
    And the owner is shown what is theirs, held while quiet unless marked urgent, and never pushed coercive content
