Feature: prism_kappa

  This repository's Prism application, in app/, built by the Prism-DevRel
  builder from its prompt set: Decides whether one object may enter the Prism under its kappa label, the content address of UOR-Foundation/kappa-registry (feat/rewrite-after-poc, commit 618f477745e601f1bf1bd5cc62aed6fea4c8936d): an axis name, a colon and the digest in lowercase hex. A label is read as kappa-registry's Kappa::parse reads it, and an object is admitted only when the browser re-derived the very digest the label names.

  @PK-01 @build
  Scenario: The app always answers nocolon when colon is absent
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv001Holds during prismpm verify
    Then no request meets breaksInv001

  @PK-02 @build
  Scenario: The app always answers unknownaxis when colon is present and axis is other
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv002Holds during prismpm verify
    Then no request meets breaksInv002

  @PK-03 @build
  Scenario: The app never answers admit when digits is wrong
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv003Holds during prismpm verify
    Then no request meets breaksInv003

  @PK-04 @build
  Scenario: The app never answers unverified when digits is wrong
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv004Holds during prismpm verify
    Then no request meets breaksInv004

  @PK-05 @build
  Scenario: The app never answers admit when hex is bad
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv005Holds during prismpm verify
    Then no request meets breaksInv005

  @PK-06 @build
  Scenario: The app never answers unverified when hex is bad
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv006Holds during prismpm verify
    Then no request meets breaksInv006

  @PK-07 @build
  Scenario: The app never answers admit when digest is mismatch
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv007Holds during prismpm verify
    Then no request meets breaksInv007

  @PK-08 @build
  Scenario: The app never answers unverified when digest is mismatch
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv008Holds during prismpm verify
    Then no request meets breaksInv008

  @PK-09 @build
  Scenario: The app never answers admit when digest is collision
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv009Holds during prismpm verify
    Then no request meets breaksInv009

  @PK-10 @build
  Scenario: The app never answers unverified when digest is collision
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv010Holds during prismpm verify
    Then no request meets breaksInv010

  @PK-11 @build
  Scenario: The app never answers admit when digest is uncomputed
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv011Holds during prismpm verify
    Then no request meets breaksInv011

  @PK-12 @build
  Scenario: The app never answers nocolon when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv012Holds during prismpm verify
    Then no request meets breaksInv012

  @PK-13 @build
  Scenario: The app never answers digits when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv013Holds during prismpm verify
    Then no request meets breaksInv013

  @PK-14 @build
  Scenario: The app never answers badhex when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv014Holds during prismpm verify
    Then no request meets breaksInv014

  @PK-15 @build
  Scenario: The app never answers mismatch when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv015Holds during prismpm verify
    Then no request meets breaksInv015

  @PK-16 @build
  Scenario: The app never answers collision when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv016Holds during prismpm verify
    Then no request meets breaksInv016

  @PK-17 @build
  Scenario: The app never answers unverified when colon is present and digits is right and hex is lower and digest is match
    Given the model in app/src/PrismKappa.lex.tex
    When the Lean kernel checks inv017Holds during prismpm verify
    Then no request meets breaksInv017
