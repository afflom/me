Feature: privacy

  The app models "the owner" and never names anyone. The owner's content lives
  only in their browser, so the repository and the page it publishes hold
  public structure and nothing personal.

  @PV-01 @build
  Scenario: Neither the tracked tree nor the built page holds personal data: every email address is at a reserved domain, and no phone, payment card or national ID number appears
    Given every file git tracks in this repository
    When the privacy gate reads each one
    Then it finds no email address outside the reserved example domains
    And it finds no phone number in international form outside the fictional 555-01xx range
    And it finds no Luhn-valid number with a payment card issuer's prefix
    And it finds no Social Security number that could be issued
    And it finds no term from the owner's local .pii-deny file
    And a planted value of each kind is refused, by file, line and kind, without printing the value
    And pages.yml runs the same gate over the assembled page before it is uploaded
