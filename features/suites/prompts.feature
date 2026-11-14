Feature: prompts

  Every decision the Prism makes has the full Prism model: its own model and constructive proofs, and its place in one Architecture, Design (OPM and UML), Features, Quality, Security and Compliance description, written by the Prism-DevRel builder from app/prompts/set.json.

  @BS-01 @build
  Scenario: Every decision spec is built with its full model by the builder, or awaiting the builder with a reason; the awaiting list only shrinks; every generated file is current
    Given app/prompts/set.json, the specifications it names in app/specs and the builder vendored at tools/builder
    When tools/prompts/gen.py --check rewrites every prompt and runs build-set --check
    Then nothing it writes differs, every decision spec is built or awaiting the builder with a reason, and the awaiting list is no longer than it was
