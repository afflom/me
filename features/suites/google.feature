Feature: google

  The owner's Gmail and Google Calendar are read from their own browser. Two
  proved guests decide: PrismGoogle whether one API call may be made, and
  PrismGoogleLink how the connection moves between its stages. The OAuth
  client is the platform's, declared in site/google/platform.json and
  inherited, so no Prism carries Google settings of its own.

  @GG-01 @build
  Scenario: The page makes a Google API call only when PrismGoogle answers fetch, which it never does while halted, to any other host, without a fresh read grant, or for a write without the owner's act
    Given the PrismGoogle guest built from app/src/PrismGoogle.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 216 requests is decided
    Then it never answers fetch while halted, for another host, without a fresh token, without a grant, or for a write without the owner's act or with a read-only grant
    And the page asks the guest before every call and makes none it did not answer fetch for
    And Lean proves the seven guarantees with exactly the axioms Quot.sound and propext

  @GG-02 @build
  Scenario: The Google connection moves between stages only as PrismGoogleLink answers: only the owner grants, a client for another origin is never used, and the kill switch or a forget revokes every grant
    Given the PrismGoogleLink guest built from app/src/PrismGoogleLink.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 480 requests is decided
    Then only the owner moves a registered or revoked connection to granted, nothing is granted before the platform client is provisioned, a client for another origin is never used, and halting revokes
    And the page provisions from platform.json, turns on one service per consent, and revokes on forget, on the kill switch, and when Google rejects the token
    And Lean proves the nine guarantees with exactly the axioms Quot.sound and propext

  @GG-03 @build
  Scenario: Mail and calendar items read from Google reach only the browser vault, through the detectors, the router and the Boundary, by GET to the two API hosts with the token only in the Authorization header
    Given a test double for Google holding synthetic mail and events
    When the owner turns on Gmail and Calendar and reads each
    Then every request is a GET to gmail.googleapis.com or www.googleapis.com, with the token only in the Authorization header, no cookies and no cache
    And each message is kept as its RFC 5322 bytes and each event as iCalendar, labeled confidential, through the detectors and the vault's Boundary call
    And a card number or a one-time code is detected so the Boundary keeps only its hash
    And the page's policy connects to those two hosts, and the consent answer crosses the origin sealed for the page that asked
