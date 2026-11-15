// Written by generators/facets (GenHolon) from app/specs/holon/spec.json and
// app/specs/curate/spec.json. Do not edit.
// The observer's two decisions and the facets it measures, as the page and its
// suites read them. The compiled guests decide.

const HOLON_SPEC = {
  "name": "prism-holon",
  "title": "Prism Holon",
  "purpose": "Decides what the Prism's observer does next for one of its facets, the Prism itself and the owner among them: hold the facet as it is, reconcile it toward the owner, curate it (try a Rule-30 hypothesis), restore its floor, or refuse. The observer turns its attention to the Prism including the owner: it changes a facet only on the owner's own gestures, never on its own measures alone, never while halted, never below the floor, and never for the sake of change when the owner and the Prism agree.",
  "authority": {
    "repository": "https://github.com/afflom/verdant-resonance",
    "commit": "2c6cd0751f46c593357d163c1ae03909c57d79e6",
    "files": [
      "prism/src/Foundation/Teleology/V1/Model.lex.tex",
      "src/game/autonomousObjectivesEngine.ts"
    ],
    "taken": "the reflexive holon: every facet has a directive, an objective and a KPI floor, the whole is a facet of itself, the co-observer is a facet, self-reference alone is bounded, and the observer reconciles the dissonance between the co-observer and the whole"
  },
  "fields": [
    {
      "name": "halted",
      "values": [
        "no",
        "yes"
      ],
      "means": "whether the owner pressed the kill switch"
    },
    {
      "name": "floor",
      "values": [
        "held",
        "regressed"
      ],
      "means": "whether the facet's floor (its parameters as first modeled) Pareto-dominates what the facet runs now (regressed) or not (held)"
    },
    {
      "name": "signal",
      "values": [
        "owner",
        "self"
      ],
      "means": "whether the window holds at least the minimum of the owner's own gestures on this facet (owner) or only the Prism's own measures (self)"
    },
    {
      "name": "tunable",
      "values": [
        "yes",
        "no"
      ],
      "means": "whether the facet's spec marks any parameter tunable"
    },
    {
      "name": "dissonance",
      "values": [
        "none",
        "some",
        "high"
      ],
      "means": "the share of what the facet brought forward that the owner undid or dismissed: none, below the high band, or at or above it"
    },
    {
      "name": "kpi",
      "values": [
        "met",
        "missed"
      ],
      "means": "whether the facet's measured KPI (the share of what it brought forward that the owner kept) is at or above the facet's floor"
    }
  ],
  "outcomes": [
    "hold",
    "reconcile",
    "curate",
    "restore",
    "refuse"
  ],
  "meanings": {"hold": "the facet stays as it is", "reconcile": "the facet moves toward the owner", "curate": "the facet tries one Rule-30 hypothesis", "restore": "the facet returns to its floor", "refuse": "the observer changes nothing"},
  "tree": {
    "if": [
      "halted",
      "yes"
    ],
    "then": "refuse",
    "else": {
      "if": [
        "floor",
        "regressed"
      ],
      "then": "restore",
      "else": {
        "if": [
          "signal",
          "self"
        ],
        "then": "hold",
        "else": {
          "if": [
            "tunable",
            "no"
          ],
          "then": "hold",
          "else": {
            "if": [
              "dissonance",
              "high"
            ],
            "then": "reconcile",
            "else": {
              "if": [
                "kpi",
                "missed"
              ],
              "then": "curate",
              "else": {
                "if": [
                  "dissonance",
                  "some"
                ],
                "then": "curate",
                "else": "hold"
              }
            }
          }
        }
      }
    }
  },
  "guarantees": [
    {
      "when": [
        [
          "halted",
          "yes"
        ]
      ],
      "always": "refuse",
      "why": "the kill switch stops the observer too: nothing changes while halted"
    },
    {
      "when": [
        [
          "halted",
          "no"
        ]
      ],
      "never": [
        "refuse"
      ],
      "why": "the observer refuses only while halted; otherwise it always answers for the facet"
    },
    {
      "when": [
        [
          "halted",
          "no"
        ],
        [
          "floor",
          "regressed"
        ]
      ],
      "always": "restore",
      "why": "the floor never regresses: when the first-modeled parameters dominate what runs, they come back"
    },
    {
      "when": [
        [
          "signal",
          "self"
        ]
      ],
      "never": [
        "reconcile",
        "curate"
      ],
      "why": "self-reference alone is bounded: the Prism never changes itself on its own measures without the owner's gestures"
    },
    {
      "when": [
        [
          "tunable",
          "no"
        ]
      ],
      "never": [
        "reconcile",
        "curate"
      ],
      "why": "only parameters a facet's spec marks tunable are ever changed"
    },
    {
      "when": [
        [
          "halted",
          "no"
        ],
        [
          "floor",
          "held"
        ],
        [
          "signal",
          "owner"
        ],
        [
          "tunable",
          "yes"
        ],
        [
          "dissonance",
          "high"
        ]
      ],
      "always": "reconcile",
      "why": "high dissonance between the owner and the Prism is reconciled toward the owner before anything is explored"
    },
    {
      "when": [
        [
          "dissonance",
          "high"
        ]
      ],
      "never": [
        "curate"
      ],
      "why": "the Prism never experiments on an owner it is already at odds with"
    },
    {
      "when": [
        [
          "dissonance",
          "none"
        ],
        [
          "kpi",
          "met"
        ]
      ],
      "never": [
        "reconcile",
        "curate"
      ],
      "why": "nothing changes for the sake of change when the owner and the Prism agree"
    },
    {
      "when": [
        [
          "floor",
          "held"
        ]
      ],
      "never": [
        "restore"
      ],
      "why": "a floor that still holds is never restored over what the owner has shaped"
    }
  ],
  "bands": {
    "window": 64,
    "every": 8,
    "minOwnerGestures": 8,
    "highDissonancePermille": 250
  },
  "gestures": {
    "brought": [
      "bloom",
      "chorus"
    ],
    "quiet": [
      "whisper",
      "rest"
    ],
    "dissonant": "a dismiss on an item after the Prism answered bloom or chorus on it",
    "missed": "a keep on an item after the Prism answered whisper or rest on it",
    "owner": [
      "open",
      "dwell",
      "keep",
      "dismiss",
      "still"
    ]
  },
  "facets": [
    {
      "id": "resonance",
      "spec": "resonance",
      "floor": 800
    },
    {
      "id": "places",
      "spec": "surface",
      "floor": 800,
      "directive": "Bring forward in {name} only what the owner keeps.",
      "objective": "The owner keeps what {name} brings forward.",
      "kpi": "the share of what {name} brought forward that the owner kept"
    },
    {
      "id": "owner",
      "spec": null,
      "floor": 850,
      "directive": "The owner is a facet of the Prism, its co-observer: their own gestures are the reference every other facet is measured against.",
      "objective": "The owner keeps what the Prism brings them, and nothing they reached for was kept quiet.",
      "kpi": "the share of the owner's keeps that the Prism had brought forward"
    },
    {
      "id": "prism",
      "spec": null,
      "floor": 800,
      "directive": "The Prism is a facet of itself: it measures itself, the owner included, and improves only its own tunable parameters, in the browser.",
      "objective": "Every facet holds its floor with the owner's gestures as the reference.",
      "kpi": "the share of measured facets whose KPI is at or above their floor"
    }
  ],
  "examples": [
    [
      "no held owner yes none met",
      "hold"
    ],
    [
      "no held owner yes some met",
      "curate"
    ],
    [
      "no held owner yes none missed",
      "curate"
    ],
    [
      "no held owner yes high met",
      "reconcile"
    ],
    [
      "no held owner yes high missed",
      "reconcile"
    ],
    [
      "no held self yes high missed",
      "hold"
    ],
    [
      "no held owner no high missed",
      "hold"
    ],
    [
      "no regressed owner yes none met",
      "restore"
    ],
    [
      "no regressed self no none met",
      "restore"
    ],
    [
      "yes held owner yes some missed",
      "refuse"
    ],
    [
      "yes regressed owner yes high missed",
      "refuse"
    ],
    [
      "no held owner yes none",
      "invalid"
    ],
    [
      "No held owner yes none met",
      "invalid"
    ]
  ],
  "resonanceDefault": {
    "directive": "Answer each of the owner's gestures humanely: bring forward what they keep, and keep quiet what they would dismiss.",
    "objective": "Nothing the owner dismisses was brought forward, nothing they keep was kept quiet, and nothing interrupts them while hurried.",
    "kpi": "the share of what the Prism brought forward that the owner kept"
  }
}
;

const CURATE_SPEC = {
  "name": "prism-curate",
  "title": "Prism Curate",
  "purpose": "Decides whether one candidate set of a facet's tunable parameters, a deterministic Rule-30 hypothesis or the observer's reconciliation toward the owner, replaces the parameters the facet runs now: adopt it under a new kappa-named claim, recall it under a claim already made, keep what runs, or refuse. A candidate is adopted only with zero humane defects, on the owner's own gestures, without falling below the facet's floor, and only when it Pareto-dominates what runs (a hypothesis) or eases the owner's dismissals (a reconciliation).",
  "authority": {
    "repository": "https://github.com/afflom/verdant-resonance",
    "commit": "2c6cd0751f46c593357d163c1ae03909c57d79e6",
    "files": [
      "src/game/conservatoryCurationEngine.ts",
      "src/game/parametricCompressionEngine.ts"
    ],
    "taken": "autonomous curation: the 64-cell cyclic Rule-30 register proposes hypotheses, the defect = 0 gate refuses any humane defect, strict Pareto dominance admits a new incumbent, every admission is a kappa-named claim minted once, and the floor never regresses"
  },
  "fields": [
    {
      "name": "halted",
      "values": [
        "no",
        "yes"
      ],
      "means": "whether the owner pressed the kill switch"
    },
    {
      "name": "tunable",
      "values": [
        "yes",
        "no"
      ],
      "means": "whether every parameter the candidate sets is one the facet's spec marks tunable, on its step and within its bounds"
    },
    {
      "name": "label",
      "values": [
        "admit",
        "other"
      ],
      "means": "the kappa facet's answer on the candidate's claim label (admit), or any other answer"
    },
    {
      "name": "defect",
      "values": [
        "zero",
        "some"
      ],
      "means": "the candidate's humane defects on replay of the window: answers that break a guarantee of the facet's spec"
    },
    {
      "name": "evidence",
      "values": [
        "owner",
        "self"
      ],
      "means": "whether the window the candidate was replayed on holds at least the minimum of the owner's own gestures"
    },
    {
      "name": "floor",
      "values": [
        "kept",
        "regressed"
      ],
      "means": "whether the facet's floor Pareto-dominates the candidate (regressed) or not (kept)"
    },
    {
      "name": "move",
      "values": [
        "explore",
        "reconcile"
      ],
      "means": "whether the candidate is a Rule-30 hypothesis (explore) or the observer's reconciliation (reconcile): the one step of one tunable that most lowers the owner's dismissals on replay"
    },
    {
      "name": "eased",
      "values": [
        "yes",
        "no"
      ],
      "means": "whether the candidate, on replay, brings forward fewer items the owner dismissed than what runs"
    },
    {
      "name": "dominance",
      "values": [
        "dominates",
        "equal",
        "dominated",
        "incomparable"
      ],
      "means": "the candidate against what runs, on the facet's objectives (each minimized): no worse on all and better on one, the same on all, no better on all and worse on one, or neither"
    },
    {
      "name": "claim",
      "values": [
        "new",
        "known"
      ],
      "means": "whether the candidate's claim label is already in the facet's ledger"
    }
  ],
  "outcomes": [
    "adopt",
    "recall",
    "keep",
    "refuse"
  ],
  "meanings": {"adopt": "the candidate runs, under a new kappa-named claim", "recall": "the candidate runs, under a claim already made", "keep": "what runs now stays", "refuse": "the candidate is never weighed"},
  "tree": {
    "if": [
      "halted",
      "yes"
    ],
    "then": "refuse",
    "else": {
      "if": [
        "tunable",
        "no"
      ],
      "then": "refuse",
      "else": {
        "if": [
          "label",
          "other"
        ],
        "then": "refuse",
        "else": {
          "if": [
            "defect",
            "some"
          ],
          "then": "keep",
          "else": {
            "if": [
              "evidence",
              "self"
            ],
            "then": "keep",
            "else": {
              "if": [
                "floor",
                "regressed"
              ],
              "then": "keep",
              "else": {
                "if": [
                  "move",
                  "reconcile"
                ],
                "then": {
                  "if": [
                    "eased",
                    "no"
                  ],
                  "then": "keep",
                  "else": {
                    "if": [
                      "claim",
                      "known"
                    ],
                    "then": "recall",
                    "else": "adopt"
                  }
                },
                "else": {
                  "if": [
                    "dominance",
                    "dominates"
                  ],
                  "then": {
                    "if": [
                      "claim",
                      "known"
                    ],
                    "then": "recall",
                    "else": "adopt"
                  },
                  "else": "keep"
                }
              }
            }
          }
        }
      }
    }
  },
  "guarantees": [
    {
      "when": [
        [
          "halted",
          "yes"
        ]
      ],
      "always": "refuse",
      "why": "the kill switch stops curation: nothing is adopted while halted"
    },
    {
      "when": [
        [
          "tunable",
          "no"
        ]
      ],
      "always": "refuse",
      "why": "a parameter the spec does not mark tunable, or a value off its step or bounds, is never set"
    },
    {
      "when": [
        [
          "label",
          "other"
        ]
      ],
      "always": "refuse",
      "why": "every adoption is named by a kappa label the kappa facet admitted"
    },
    {
      "when": [
        [
          "defect",
          "some"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "the humane gate: a candidate with any defect is never adopted (defect = 0)"
    },
    {
      "when": [
        [
          "evidence",
          "self"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "self-reference alone is bounded: no candidate is adopted without the owner's gestures"
    },
    {
      "when": [
        [
          "floor",
          "regressed"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "the floor never regresses: no candidate the floor dominates is adopted"
    },
    {
      "when": [
        [
          "move",
          "explore"
        ],
        [
          "dominance",
          "equal"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "a hypothesis that changes nothing measurable is not adopted (strict dominance)"
    },
    {
      "when": [
        [
          "move",
          "explore"
        ],
        [
          "dominance",
          "dominated"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "a hypothesis worse than what runs is never adopted"
    },
    {
      "when": [
        [
          "move",
          "explore"
        ],
        [
          "dominance",
          "incomparable"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "a hypothesis that trades one objective for another is not adopted: improvement is strict Pareto dominance"
    },
    {
      "when": [
        [
          "move",
          "reconcile"
        ],
        [
          "eased",
          "no"
        ]
      ],
      "never": [
        "adopt",
        "recall"
      ],
      "why": "a reconciliation is adopted only when it eases the owner's dismissals"
    },
    {
      "when": [
        [
          "claim",
          "known"
        ]
      ],
      "never": [
        "adopt"
      ],
      "why": "a claim is minted once: a known claim is recalled, never minted again"
    },
    {
      "when": [
        [
          "claim",
          "new"
        ]
      ],
      "never": [
        "recall"
      ],
      "why": "only a claim in the ledger can be recalled"
    },
    {
      "when": [
        [
          "halted",
          "no"
        ],
        [
          "tunable",
          "yes"
        ],
        [
          "label",
          "admit"
        ]
      ],
      "never": [
        "refuse"
      ],
      "why": "a well-formed, kappa-named candidate is weighed, never refused"
    }
  ],
  "objectives": [
    "dissonant",
    "missed",
    "interruptions"
  ],
  "rule30": {
    "cells": 64,
    "seed": "11400714819323198485",
    "lanes": 4,
    "vectors": [
      [
        "11400714819323198485",
        "8170733857868071477"
      ],
      [
        "0",
        "8170733857868071477"
      ],
      [
        "1",
        "9223372036854775811"
      ]
    ],
    "step": "next(i) = cell(i + 1) XOR (cell(i) OR cell(i - 1)), on Z/64Z; the all-zero register is seeded first",
    "lane": "lane g is bits 16g .. 16g + 7 of the stepped register: bits 0-3 pick the tunable (mod their count), bit 4 the direction, bits 5-6 one to four steps"
  },
  "claim": {
    "profile": "prism/curate-claim/1",
    "form": "profile|facet|parameters as name=value joined by ,|objectives joined by ,|move",
    "axis": "sha256",
    "ledger": 64
  },
  "examples": [
    [
      "no yes admit zero owner kept explore yes dominates new",
      "adopt"
    ],
    [
      "no yes admit zero owner kept explore yes dominates known",
      "recall"
    ],
    [
      "no yes admit zero owner kept explore yes equal new",
      "keep"
    ],
    [
      "no yes admit zero owner kept explore yes dominated new",
      "keep"
    ],
    [
      "no yes admit zero owner kept explore yes incomparable new",
      "keep"
    ],
    [
      "no yes admit zero owner kept reconcile yes incomparable new",
      "adopt"
    ],
    [
      "no yes admit zero owner kept reconcile yes dominated known",
      "recall"
    ],
    [
      "no yes admit zero owner kept reconcile no dominates new",
      "keep"
    ],
    [
      "no yes admit zero owner regressed reconcile yes dominates new",
      "keep"
    ],
    [
      "no yes admit zero self kept explore yes dominates new",
      "keep"
    ],
    [
      "no yes admit some owner kept explore yes dominates new",
      "keep"
    ],
    [
      "no yes other zero owner kept explore yes dominates new",
      "refuse"
    ],
    [
      "no no admit zero owner kept explore yes dominates new",
      "refuse"
    ],
    [
      "yes yes admit zero owner kept explore yes dominates new",
      "refuse"
    ],
    [
      "no yes admit zero owner kept explore dominates",
      "invalid"
    ],
    [
      "no yes admit zero owner kept explore yes Dominates new",
      "invalid"
    ]
  ]
}
;

import { SPEC as RESONANCE } from '../resonance/table.mjs';
import { PLACES } from '../surface/surface.mjs';

// A facet's tree, as the page and its suites read it: each test is one field
// against one value.
const walk = (t, r) => (typeof t === 'string' ? t : walk(r[t.if[0]] === t.if[1] ? t.then : t.else, r));
const decision = (spec) => ({
  fields: spec.fields.map((f) => [f.name, f.values]),
  answers: spec.outcomes,
  maxLine: spec.fields.reduce((n, f) => n + Math.max(...f.values.map((x) => x.length)), spec.fields.length - 1),
  guarantees: spec.guarantees.map((g, i) => ({ id: 'INV-' + String(i + 1).padStart(3, '0'), ...g })),
  judge(r) {
    return walk(spec.tree, r);
  },
  line(r) {
    return this.fields.map(([n]) => r[n]).join(' ');
  },
});

export const HOLON = decision(HOLON_SPEC);
export const CURATE = decision(CURATE_SPEC);

// The holon's facets: each with its directive, objective, KPI, floor and the
// parameters its own spec marks tunable. A place takes its name from the
// surface model; a facet with a spec takes its title and purpose from it.
const SPECS = { resonance: RESONANCE };
const named = (s, name) => s.replaceAll('{name}', name);
export const FACETS = HOLON_SPEC.facets.flatMap((f) => {
  if (f.id === 'places') {
    return PLACES.map((p) => ({ id: p.key, kind: 'place', name: p.name, floor: f.floor, directive: named(f.directive, p.name), objective: named(f.objective, p.name), kpi: named(f.kpi, p.name), tunable: [] }));
  }
  if (f.spec && !SPECS[f.spec]) throw new Error('holon: no table for the spec of facet ' + f.id);
  const spec = f.spec ? SPECS[f.spec] : {};
  const base = f.id === 'resonance' ? HOLON_SPEC.resonanceDefault : {};
  return [{ id: f.id, kind: f.spec ? 'facet' : f.id, name: spec.title ?? f.id, floor: f.floor, directive: f.directive || spec.purpose || base.directive, objective: f.objective || base.objective || null, kpi: f.kpi || base.kpi || null, tunable: spec.tunable ?? [] }];
});
export const BANDS = HOLON_SPEC.bands;
export const GESTURES = HOLON_SPEC.gestures;
export const OBJECTIVES = CURATE_SPEC.objectives;
export const RULE30 = { cells: CURATE_SPEC.rule30.cells, seed: CURATE_SPEC.rule30.seed, lanes: CURATE_SPEC.rule30.lanes, vectors: CURATE_SPEC.rule30.vectors };
export const CLAIM = CURATE_SPEC.claim;
