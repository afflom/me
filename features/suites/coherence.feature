Feature: coherence

  The Prism's facets bound into one runtime by app/specs/coherence/spec.json,
  after verdant resonance's model coherence: typed ports, a generated flow, a
  gate, and the page used the way its owner uses it.

  @CO-01 @build
  Scenario: The owner brings content in through the feeders the coherence registry names and every place that lists things lists it: Today shows the agenda ahead with what falls today and what clashes as PrismChronology answers, and Ask answers at once with the owner's own kept items that meet it, only as the Boundary allows, never while halted
    Given the assembled page with the verified app.holo, and synthetic files: a calendar with two clashing events today, a bank's mail, and a Takeout zip with an mbox, a calendar and contacts
    When test/page/person.test.mjs adds the files from an empty Today, the zip from the Boundary, pastes words, keeps a note in every note place, opens every place and asks five questions, then one while halted, in headless Chromium
    Then every place that lists things lists something, Today marks today's events and their clash, each question is answered with the matching kept item or No answer, and the halted question is answered Halted

  @CO-02 @build
  Scenario: Every facet the Prism root routes is one model in the coherence registry with typed ports, live with the page modules that ask it or sealed by a PrismHost surface, and the build refuses a registry whose flow leaves a port unproduced or untaken, a place unfed, an act or setting undriven, a feeder's media without a domain or a domain without vocabulary
    Given app/specs/coherence/spec.json and the root's facets in tools/prism_root.py
    When test/coherence/coherence.test.mjs runs tools/coherence/gen.py --check and then each planted defect
    Then the committed registry passes and every planted defect is refused with its reason

  @CO-03 @build
  Scenario: A kept item belongs to its media's domain and to every domain whose vocabulary in the coherence registry it uses, and an Ask finds the span its intent words name
    Given site/coherence/sense.mjs and site/coherence/today.mjs over the registry
    When test/coherence/coherence.test.mjs places a bank statement, asks about tomorrow and a flight, and builds Today with a stand-in for the when facet
    Then the statement is in Money and Conversations, tomorrow is the next day, the flight is drawn and nothing else, and Today asks only spans within one week

  @CO-04 @build
  Scenario: A zip the owner picks or drops, such as a Google Takeout export, opens in the browser to its entries, stored or deflated and ZIP64 included, each judged by PrismFolder by its own format
    Given a zip with one deflated and one stored entry, and a file that is not a zip
    When test/coherence/coherence.test.mjs opens both with site/device/zip.mjs
    Then the entries come back by name and folder with their exact bytes, and the other file is refused
