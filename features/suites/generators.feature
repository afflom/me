Feature: generators

  Every generated file is written by a LexLean program: text/3 applications in generators/, one per family of generators, sharing one Foundation, each pinned to its sources and run step by step over the files it reads.

  @GN-01 @build
  Scenario: Every output generators/pipeline.json names is what its LexLean generator writes, each generator program is built from its sources as they stand, and every program carries generators/foundation byte for byte
    Given each program generators/(program)/ with its pinned bin/prism-generators and lock.json, and generators/foundation
    When tools/generators/run.sh --check runs each step of generators/pipeline.json, one request of at most 32 KiB per input or piece of input
    Then each program's sources and binary match its lock, its Foundation is generators/foundation byte for byte, every generator writes its output, and every committed output is byte for byte what it writes
