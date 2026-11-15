Feature: generators

  Every generated file is written by a LexLean program: one text/3 application in generators/, each generator a module, pinned to its sources and run step by step over the files it reads.

  @GN-01 @build
  Scenario: Every output generators/pipeline.json names is what its LexLean generator writes, and the program is built from generators/ as it stands
    Given generators/, its pinned program generators/bin/prism-generators and generators/lock.json
    When tools/generators/run.sh --check runs each step of generators/pipeline.json, one request of at most 32 KiB per input or piece of input
    Then the program's sources and binary match the lock, every generator writes its output, and every committed output is byte for byte what it writes
