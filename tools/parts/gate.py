"""PT-01 and PD-03 are LexLean programs now (generators/parts, generators/product).

Main's merge train still names this path, so it runs their GN-01 check: every
committed output is what its program writes, and every planted case is still
refused the same way. Remove it once the train runs tools/generators/run.sh.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.exit(subprocess.run(["sh", "tools/generators/run.sh", "--check"], cwd=ROOT).returncode)
