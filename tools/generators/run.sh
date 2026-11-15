#!/bin/sh
# Runs every step of generators/<program>/steps.json through its program, the
# programs in name order. Request bounds are in generators/pipeline.json.
# Each program is a LexLean text/3 application, generators/<program>/, built by
# `prismpm build` and pinned by tools/generators/build.sh. Their Foundation is
# one module set, generators/foundation/, copied byte for byte into each.
#   tools/generators/run.sh          write each step's output
#   tools/generators/run.sh --check  fail when a committed output differs (GN-01)
#   tools/generators/run.sh --lock P record program P's sources and binary (build.sh)
# A request is "<generator> <output>\n" and a ustar archive of the step's inputs,
# and must fit the request bound. A step with "split" runs once per piece of that
# file, cut at line ends (only before a line matching its "breakBefore", where it has one); a step with "each" runs once per element of a JSON array;
# either way its output is the outputs joined in order. Outputs under .gen/ are
# intermediate and never committed; a step reads only the .gen/ outputs of its
# own program's earlier steps, so programs never depend on each other's order.
set -eu
cd "$(dirname "$0")/../.."
mode=${1:-write}

# A program is pinned to its sources: a change to generators/<program>/ needs build.sh.
digest() { # digest PROGRAM
  sources=$(git ls-files --others --cached --exclude-standard "generators/$1" | grep -v -e "^generators/$1/bin/" -e "^generators/$1/lock.json$" -e "^generators/$1/steps.json$" | sort)
  printf '{\n  "comment": "Written by tools/generators/build.sh. GN-01 fails when generators/%s or its program no longer match.",\n  "sources": "%s",\n  "program": "%s"\n}\n' \
    "$1" "$(sha256sum $sources | sha256sum | cut -c1-64)" "$(sha256sum "generators/$1/bin/prism-generators" | cut -c1-64)"
}
if [ "$mode" = --lock ]; then digest "$2" > "generators/$2/lock.json"; echo "pinned generators/$2"; exit 0; fi
if [ "$mode" = --check ]; then
  for lock in generators/*/lock.json; do
    p=$(basename "$(dirname "$lock")")
    if ! digest "$p" | cmp -s - "$lock"; then
      echo "GN-01: generators/$p changed since its program was built: run SDK=(image) tools/generators/build.sh $p" >&2; exit 1
    fi
    for f in $(cd generators/foundation && find . -type f | sort); do
      if ! cmp -s "generators/foundation/$f" "generators/$p/src/Foundation/$f"; then
        echo "GN-01: generators/$p/src/Foundation/$f is not generators/foundation/$f" >&2; exit 1
      fi
    done
  done
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
  if ! "generators/$program/bin/prism-generators" run "$work/request" > "$work/report"; then
    echo "GN-01: $gen for $out: $(head -c 400 "$work/report")" >&2; exit 1
  fi
  tail -c +9 "$work/report" >> "$work/out"
}

for steps_file in generators/*/steps.json; do
program=$(basename "$(dirname "$steps_file")")
: > "$work/made"
js .steps < "$steps_file" | while read -r step; do
  gen=$(echo "$step" | js .generator); out=$(echo "$step" | js .output); ins=$(echo "$step" | js .inputs)
  for f in $ins; do
    case $f in .gen/*) grep -qxF "$f" "$work/made" || {
      echo "GN-01: $program $gen reads $f, which no earlier step of $steps_file writes" >&2; exit 1; } ;; esac
  done
  : > "$work/out"
  split_path=$(echo "$step" | js .split)
  each_path=$(echo "$step" | js .each.file)
  if [ -n "$each_path" ]; then
    # One request per element of a JSON array, each staged as the file itself beside the step's inputs.
    js "$(echo "$step" | js .each.array)" < "$each_path" > "$work/elements"
    while read -r element; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$each_path")"
      printf '%s\n' "$element" > "$work/stage/$each_path"
      for f in $ins; do mkdir -p "$work/stage/$(dirname "$f")"; cp "$f" "$work/stage/$f"; done
      run "$gen" "$out" "$work/stage" "$each_path" $ins
    done < "$work/elements"
  elif [ -n "$split_path" ]; then
    rm -rf "$work/pieces"; mkdir -p "$work/pieces"
    brk=$(echo "$step" | js .breakBefore)
    if [ -z "$brk" ]; then split -C "$piece" -d -a 4 "$split_path" "$work/pieces/p."
    # With "breakBefore", a unit runs to the next line that matches it, and pieces end only between units.
    else LC_ALL=C awk -v rx="$brk" -v max="$piece" -v out="$work/pieces/p." '
      function flush() { if (length(p) + length(u) > max && p != "") { printf "%s", p > sprintf("%s%04d", out, n++); p = "" } if (length(u) > max) bad = 1; p = p u; u = "" }
      $0 ~ rx { flush() } { u = u $0 "\n" } END { flush(); if (bad) exit 1; printf "%s", p > sprintf("%s%04d", out, n) }' "$split_path" || { echo "GN-01: $split_path: a unit before $brk is over $piece bytes" >&2; exit 1; }; fi
    for p in "$work/pieces"/p.*; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$split_path")"
      cp "$p" "$work/stage/$split_path"
      run "$gen" "$out" "$work/stage" "$split_path"
    done
  else
    rm -rf "$work/stage"; mkdir -p "$work/stage"
    for f in $ins; do mkdir -p "$work/stage/$(dirname "$f")"; cp "$f" "$work/stage/$f"; done
    run "$gen" "$out" "$work/stage" $ins
  fi
  case $out in
    .gen/*) mkdir -p "$(dirname "$out")"; cp "$work/out" "$out" ;;
    *) if [ "$mode" = --check ]; then
         if ! cmp -s "$work/out" "$out"; then echo "GN-01: $out is not what $gen writes from its inputs" >&2; exit 1; fi
         echo "GN-01: $out is what $gen writes"
       else cp "$work/out" "$out"; echo "wrote $out ($gen)"; fi ;;
  esac
  echo "$out" >> "$work/made"
done
done
