#!/bin/sh
# Runs every step of generators/pipeline.json through the generators program,
# a LexLean text/3 application built by `prismpm build` in generators/.
#   tools/generators/run.sh          write each step's output
#   tools/generators/run.sh --check  fail when a committed output differs (GN-01)
# A request is "<generator> <output>\n" and a ustar archive of the step's inputs,
# and must fit the program's request bound. A step with "split" runs once per
# piece of that file, cut at line ends, and its output is the pieces' outputs
# joined in order; a step with "each" runs once per element of a JSON array.
# Outputs under .gen/ are intermediate and never committed.
#   tools/generators/run.sh --lock           record the program's sources and binary (build.sh)
set -eu
cd "$(dirname "$0")/../.."
program=generators/bin/prism-generators; mode=${1:-write}

# The program is pinned to its sources: a change to generators/ needs build.sh.
digest() {
  sources=$(git ls-files --others --cached --exclude-standard generators | grep -v -e '^generators/bin/' -e '^generators/lock.json$' -e '^generators/pipeline.json$' | sort)
  printf '{\n  "comment": "Written by tools/generators/build.sh. GN-01 fails when generators/ or the program no longer match.",\n  "sources": "%s",\n  "program": "%s"\n}\n' \
    "$(sha256sum $sources | sha256sum | cut -c1-64)" "$(sha256sum "$program" | cut -c1-64)"
}
if [ "$mode" = --lock ]; then digest > generators/lock.json; echo "pinned $program"; exit 0; fi
if [ "$mode" = --check ] && ! digest | cmp -s - generators/lock.json; then
  echo "GN-01: generators/ changed since its program was built: run SDK=<image> tools/generators/build.sh" >&2; exit 1
fi
# js PATH < JSON: the value at a dotted path, one line per element of an array.
js() { python3 -I -c 'import json, sys
v = json.load(sys.stdin)
for k in sys.argv[1].split(".")[1:]:
    v = v.get(k) if isinstance(v, dict) else None
for x in (v if isinstance(v, list) else [] if v is None else [v]):
    print(x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, separators=(",", ":")))' "$1"; }
bound=$(js .requestMaximum < generators/pipeline.json)
piece=$(js .pieceMaximum < generators/pipeline.json)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

run() { # run GENERATOR OUTPUT STAGE PATHS... -> appends the written file to $work/out
  gen=$1; out=$2; stage=$3; shift 3
  { printf '%s %s\n' "$gen" "$out"
    tar --format=ustar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -b 1 -cf - -C "$stage" "$@"
  } > "$work/request"
  size=$(wc -c < "$work/request")
  if [ "$size" -gt "$bound" ]; then
    echo "GN-01: $gen for $out: request of $size bytes exceeds the bound $bound; split its input" >&2; exit 1
  fi
  if ! "$program" run "$work/request" > "$work/report"; then
    echo "GN-01: $gen for $out: $(head -c 400 "$work/report")" >&2; exit 1
  fi
  tail -c +9 "$work/report" >> "$work/out"
}

steps=$(js .steps < generators/pipeline.json)
echo "$steps" | while read -r step; do
  gen=$(echo "$step" | js .generator); out=$(echo "$step" | js .output)
  : > "$work/out"
  split_path=$(echo "$step" | js .split)
  each_path=$(echo "$step" | js .each.file)
  if [ -n "$each_path" ]; then
    # One request per element of a JSON array, each staged as the file itself.
    js "$(echo "$step" | js .each.array)" < "$each_path" > "$work/elements"
    while read -r element; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$each_path")"
      printf '%s\n' "$element" > "$work/stage/$each_path"
      run "$gen" "$out" "$work/stage" "$each_path"
    done < "$work/elements"
  elif [ -n "$split_path" ]; then
    rm -rf "$work/pieces"; mkdir -p "$work/pieces"
    split -C "$piece" -d -a 4 "$split_path" "$work/pieces/p."
    for p in "$work/pieces"/p.*; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$split_path")"
      cp "$p" "$work/stage/$split_path"
      run "$gen" "$out" "$work/stage" "$split_path"
    done
  else
    rm -rf "$work/stage"; mkdir -p "$work/stage"
    for f in $(echo "$step" | js .inputs); do
      mkdir -p "$work/stage/$(dirname "$f")"; cp "$f" "$work/stage/$f"
    done
    run "$gen" "$out" "$work/stage" $(echo "$step" | js .inputs)
  fi
  case $out in
    .gen/*) mkdir -p "$(dirname "$out")"; cp "$work/out" "$out" ;;
    *) if [ "$mode" = --check ]; then
         if ! cmp -s "$work/out" "$out"; then echo "GN-01: $out is not what $gen writes from its inputs" >&2; exit 1; fi
         echo "GN-01: $out is what $gen writes"
       else cp "$work/out" "$out"; echo "wrote $out ($gen)"; fi ;;
  esac
done
