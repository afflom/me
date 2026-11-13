Feature: page

  The Prism's own surface in site/card.*: the places, acts and settings of
  PrismSurface, wired only to the verified app guest, the vault and R4.

  @PG-01 @build
  Scenario: The page keeps, reads and answers only through the verified app: a note is kept at its domain's floor only when the Boundary and the vault allow it, nothing is kept while halted, and an outbound act is only drafted until the owner's Send
    Given the assembled page with the verified app.holo
    When test/page/card.test.mjs keeps a task and a health note, halts, keeps another task and drafts a message in headless Chromium
    Then the task is kept, the health note is kept sealed, the task while halted is refused and the message is ready to send, not sent
    And crates/conformance/tests/page.rs holds every decision in site/card.mjs to the app guest

  @PG-02 @build
  Scenario: The page is PrismSurface made visible: one place per owner view of the design model, showing that view's domains under its role, every act and setting in its modeled place, every visible word a name from the model, and every colour a tone of its modeled look read at its contrast
    Given the fixture PG-02 needs
    When the suite exercises PG-02
    Then The page is PrismSurface made visible: one place per owner view of the design model, showing that view's domains under its role, every act and setting in its modeled place, every visible word a name from the model, and every colour a tone of its modeled look read at its contrast
