#!/bin/sh
# Runs every step of generators/<program>/steps.json through its program, the
# programs in name order. Request bounds are in generators/pipeline.json.
# Each program is a LexLean text/3 application, generators/<program>/, built by
# `prismpm build` and pinned by tools/generators/build.sh. Their Foundation is
# one module set, generators/foundation/, copied byte for byte into each.
#   tools/generators/run.sh          write each step's output
#   tools/generators/run.sh --check  fail when a committed output differs, or a
#                                    program's cases/ no longer get their reports (GN-01)
#   tools/generators/run.sh --lock P record program P's sources and binary (build.sh)
# A request is "<generator> <output>\n" and a ustar archive of the step's inputs,
# and must fit the request bound. A step with "split" runs once per piece of that
# file, cut at line ends (only before a line matching its "breakBefore", where it has one), each piece
# staged with the step's other inputs and kept that much smaller; a step with "each" runs once per element of a JSON array;
# a step with "glob" runs once per tracked file its patterns match (cut the same
# way; with "head": true only its first piece), with its "inputs" beside it;
# a step with "lines" runs once per line of that file, beside its "inputs";
# its output is the outputs joined in order. Outputs under .gen/ are
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
  # A program's cases/ are planted defects it must keep answering the same way:
  # NAME.request is a request, NAME.report the report its program must print.
  for req in generators/*/cases/*.request; do
    [ -e "$req" ] || continue
    p=$(echo "$req" | cut -d/ -f2)
    if ! "generators/$p/bin/prism-generators" run "$req" 2>&1 | cmp -s - "${req%.request}.report"; then
      echo "GN-01: generators/$p no longer answers $req with ${req%.request}.report" >&2; exit 1
    fi
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
  globs=$(echo "$step" | js .glob); head=$(echo "$step" | js .head)
  lines_path=$(echo "$step" | js .lines)
  if [ -n "$globs" ]; then
    # One request per tracked file the globs match (per piece, when it is
    # larger than a piece), staged at its path beside the step's inputs; a
    # piece leaves room in the request for those inputs and their headers.
    ins=$(echo "$step" | js .inputs)
    rm -rf "$work/with"; mkdir -p "$work/with"
    room=$piece
    for i in $ins; do
      mkdir -p "$work/with/$(dirname "$i")"; cp "$i" "$work/with/$i"
      room=$((room - $(wc -c < "$i") - 1024))
    done
    if [ "$room" -lt 4096 ]; then echo "GN-01: $gen for $out: its inputs leave no room for a piece; split them" >&2; exit 1; fi
    if ! files=$(set -f; git ls-files -- $globs) || [ -z "$files" ]; then
      echo "GN-01: $gen for $out: its globs match no tracked file" >&2; exit 1
    fi
    for f in $files; do
      rm -rf "$work/pieces"; mkdir -p "$work/pieces"
      split -C "$room" -d -a 4 "$f" "$work/pieces/p."
      [ -s "$f" ] || : > "$work/pieces/p.0000"
      for p in "$work/pieces"/p.*; do
        rm -rf "$work/stage"; cp -r "$work/with" "$work/stage"; mkdir -p "$work/stage/$(dirname "$f")"
        cp "$p" "$work/stage/$f"
        run "$gen" "$out" "$work/stage" "$f" $ins
        [ "$head" != true ] || break
      done
    done
  elif [ -n "$lines_path" ]; then
    # One request per line of a file, staged as that file holding only that
    # line, beside the step's inputs.
    ins=$(echo "$step" | js .inputs)
    while IFS= read -r line; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$lines_path")"
      for i in $ins; do mkdir -p "$work/stage/$(dirname "$i")"; cp "$i" "$work/stage/$i"; done
      printf '%s\n' "$line" > "$work/stage/$lines_path"
      run "$gen" "$out" "$work/stage" "$lines_path" $ins
    done < "$lines_path"
  elif [ -n "$each_path" ]; then
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
    room=$piece; for f in $ins; do [ "$f" = "$split_path" ] || room=$((room - $(wc -c < "$f") - 1024)); done
    brk=$(echo "$step" | js .breakBefore)
    if [ -z "$brk" ]; then split -C "$room" -d -a 4 "$split_path" "$work/pieces/p."
    # With "breakBefore", a unit runs to the next line that matches it, and pieces end only between units.
    else LC_ALL=C awk -v rx="$brk" -v max="$room" -v out="$work/pieces/p." '
      function flush() { if (length(p) + length(u) > max && p != "") { printf "%s", p > sprintf("%s%04d", out, n++); p = "" } if (length(u) > max) bad = 1; p = p u; u = "" }
      $0 ~ rx { flush() } { u = u $0 "\n" } END { flush(); if (bad) exit 1; printf "%s", p > sprintf("%s%04d", out, n) }' "$split_path" || { echo "GN-01: $split_path: a unit before $brk is over $room bytes" >&2; exit 1; }; fi
    for p in "$work/pieces"/p.*; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$split_path")"
      for f in $ins; do mkdir -p "$work/stage/$(dirname "$f")"; cp "$f" "$work/stage/$f"; done
      cp "$p" "$work/stage/$split_path"
      others=$(for f in $ins; do [ "$f" = "$split_path" ] || echo "$f"; done)
      run "$gen" "$out" "$work/stage" "$split_path" $others
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
