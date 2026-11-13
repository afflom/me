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
  Scenario: The page is PrismSurface made visible: one place per owner view of the design model, showing that view's domains under its role, every act and setting in its modeled place, every visible word a name from the model, every list place fed by a source or an act, and every colour a tone of its modeled look read at its contrast
    Given the fixture PG-02 needs
    When the suite exercises PG-02
    Then The page is PrismSurface made visible: one place per owner view of the design model, showing that view's domains under its role, every act and setting in its modeled place, every visible word a name from the model, every list place fed by a source or an act, and every colour a tone of its modeled look read at its contrast

  @PG-03 @build
  Scenario: Every act on the page completes end to end: what the owner sends is the very event or message they reviewed and is kept in the place it left from at that domain's floor, every kept item opens to its words, and Ask draws on the kept items that share its words, never while halted, under the highest label it drew on
    Given the assembled page with the verified app.holo
    When test/page/acts.test.mjs keeps a task, reviews and sends an event and a message, opens the message, and asks a question, then asks again while halted, in headless Chromium
    Then the event and the message are sent to the owner's apps and kept in Calendar and Conversations, the message opens to its body, the question draws on the task, and the question asked while halted draws on nothing
    And crates/conformance/tests/page.rs holds the event's stamp to Review, the keep of what was sent to the domain's floor and the Ask's label to what it drew on

  @VO-01 @build
  Scenario: The Prism answers a gesture in tone and colour from PrismSurface's voice: 5-limit just ratios within one octave, a loudness ceiling, a rest between answers, silent under Quiet, and nothing loaded before the owner's first gesture
    Given the fixture VO-01 needs
    When the suite exercises VO-01
    Then The Prism answers a gesture in tone and colour from PrismSurface's voice: 5-limit just ratios within one octave, a loudness ceiling, a rest between answers, silent under Quiet, and nothing loaded before the owner's first gesture
