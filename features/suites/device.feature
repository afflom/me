Feature: device

  The owner's mail, calendar and contacts are read from their own device:
  a folder they grant once in the browser's own picker, or files they pick
  or drop. One proved guest, PrismFolder, decides every list and every read.
  No client is registered and nothing is configured: the browser's grant is
  the only consent, and the Prism never writes to the device.

  @DV-01 @build
  Scenario: The page lists or reads on the owner's device only when PrismFolder answers read, which it never does while halted, without the browser's grant, for a write, for a file that is not mail, calendar or contacts, or for one too large to read at once
    Given the PrismFolder guest built from app/src/PrismFolder.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 288 requests is decided
    Then it never answers read while halted, without a granted handle, for a write, for another format or for a large read
    And the page asks the guest before every list and every read and acts on nothing else
    And Lean proves the seven guarantees with exactly the axioms Quot.sound and propext

  @DV-02 @build
  Scenario: Mail, calendar and contacts read from the owner's device reach only the browser vault, through the detectors and the Boundary, from a folder opened read-only or files the owner picked or dropped
    Given a test double for a granted folder holding a synthetic mbox, an iCalendar file, a Maildir message and files of other kinds
    When the owner adds the folder, reads it, halts, lets the grant lapse and allows it again, and drops files
    Then each message, event and card is kept as its own bytes, labeled confidential, through the detectors and the vault's Boundary call
    And other files and hidden folders are never read, a file already read is passed over, and nothing is read while halted or while the grant has lapsed
    And the folder is opened read-only and the source sits in the Boundary's settings as one row, This device

  @DV-03 @build
  Scenario: The page uses each surface the browser reports for the owner's content only as PrismHost answers: every reported surface is used or offered, nothing is used while halted, a paste, drop, pick or contact list only on the owner's act, a folder only on the owner's act or a grant the browser keeps, and a live account on another origin is named sealed
    Given the PrismHost guest built from app/src/PrismHost.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 128 requests is decided, and the page plans a visit on a browser that reports every surface and on one that reports none
    Then every surface the browser reports is used or offered, a live mail or calendar account on another origin is sealed, and while halted every surface is refused
    And items are kept on as many lanes as uorc's host rule allows for the cores and memory the browser reports, and no more
    And Lean proves the ten guarantees with exactly the axioms Quot.sound and propext
