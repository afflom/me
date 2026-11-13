Feature: resonance

  The Prism answers the owner as afflom/verdant-resonance answers its
  player, without its garden: each gesture toward a thing the Prism holds
  (open, dwell, keep, dismiss, still) is answered by one proved guest,
  PrismResonance (rest, whisper, chime, bloom, chorus or recede), and the
  answer's signal teaches PrismLearning. Its guarantees follow verdant's
  Humane, Vedanta and Dharma models: stillness is met with stillness
  (Turiya), the owner is never pressed (Ahimsa), a hurried owner is never
  met with more (restorative pacing), and what was learned survives a reload
  with zero drift (Anamnesis).

  @RS-01 @build
  Scenario: The Prism answers a gesture of the owner only as PrismResonance answers: stillness with rest, a dismissal at once with recede, the kill switch with rest; quiet never sounds or brings anything forward, nor does a hurried pace, a glance, or a belief the owner rejected; only a consolidated or confirmed belief gathers a chorus
    Given the PrismResonance guest built from app/src/PrismResonance.lex.tex, refused unless its SHA-256 is the pinned one
    When every one of its 1920 requests is decided
    Then each answer is the generated decision table's answer and keeps all ten guarantees
    And the Prism root routes "resonance <request>" to PrismResonance::resonanceDispatch
    And Lean proves the ten guarantees with exactly the axioms Quot.sound and propext

  @RS-02 @build
  Scenario: The page answers the owner's gestures and learns from them only through the root guest: each answer's learning signal goes to PrismLearning, only the owner confirms or rejects, and what was learned is kept as a sealed snapshot in this browser that restores with zero drift or not at all
    Given the root guest's resonance and learn facets, and a store for the snapshot
    When the owner stays with a thing, glances at it, hurries, dismisses, keeps while quiet, and halts
    Then a stay brings it forward and raises its weight until it consolidates, and nothing else is learned
    And a reload restores exactly what was learned, and a tampered snapshot restores nothing
    And replaying the gestures under other tunables gives the curator the same answers, pure
