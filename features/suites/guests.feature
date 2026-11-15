Feature: guests

  Every decision the page answers on its own, in a standalone guest, is built from the same modules the Prism compiles, so no guest the page runs is older than the model.

  @GU-01 @build
  Scenario: Every standalone decision guest the page runs is built in the locked SDK from the modules the Prism compiles: its recorded source is the project laid out from those modules, its acceptance vectors and its limits, its wasm is the one recorded, and the page pins that wasm
    Given app/specs/guests/spec.json, the modules it names in app/src and app/specs/guests/lock.json
    When tools/guests/gen.py check lays out each guest's project and hashes it, its wasm and its pin
    Then every source, wasm and pin matches the lock, and tools/guests/build.sh rebuilds any that does not
