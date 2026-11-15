Feature: standards

  Every part of the Prism is a full implementation of the standards it answers to: each standard is registered in app/specs/standards/spec.json, its own normative text pinned by checksum, and its requirements are extracted from that text, never written by hand.

  @ST-01 @build
  Scenario: Every part of the Prism answers to a registered standard or says why none applies, and every normative requirement of each standard whose text is pinned by checksum, extracted mechanically from that text, is enforced by a suite that reaches a part it governs, beyond a debt list that only shrinks; a standard whose text is not pinned says why
    Given app/specs/standards/spec.json, the texts it pins by SHA-256 and app/specs/standards/debt.json
    When tools/standards/gate.py --check re-derives test/standards/requirements.json from the pinned texts, reads every suite's enforces lines and the register's enforcedBy, and on a pull request compares the debt with the base branch
    Then every part is governed, ungoverned with a reason or listed as unassigned, every requirement is enforced by a suite that reaches a part its standard governs or is listed as debt, and neither list has grown
