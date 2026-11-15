#!/bin/sh
# Runs every step of generators/pipeline.json through the generator programs.
# Each program is a LexLean text/3 application, generators/<program>/, built by
# `prismpm build` and pinned by tools/generators/build.sh. Their Foundation is
# one module set, generators/foundation/, copied byte for byte into each.
#   tools/generators/run.sh          write each step's output
#   tools/generators/run.sh --check  fail when a committed output differs, or a
#                                    program's cases/ no longer get their reports (GN-01)
#   tools/generators/run.sh --lock P record program P's sources and binary (build.sh)
# A request is "<generator> <output>\n" and a ustar archive of the step's inputs,
# and must fit the request bound. A step with "split" runs once per piece of that
# file, cut at line ends; a step with "each" runs once per element of a JSON array;
# a step with "glob" runs once per tracked file its patterns match (cut the same
# way), with its "inputs" beside it; its output is the outputs joined in order. Outputs under .gen/ are
# intermediate and never committed.
set -eu
cd "$(dirname "$0")/../.."
mode=${1:-write}

# A program is pinned to its sources: a change to generators/<program>/ needs build.sh.
digest() { # digest PROGRAM
  sources=$(git ls-files --others --cached --exclude-standard "generators/$1" | grep -v -e "^generators/$1/bin/" -e "^generators/$1/lock.json$" | sort)
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

steps=$(js .steps < generators/pipeline.json)
echo "$steps" | while read -r step; do
  program=$(echo "$step" | js .program); gen=$(echo "$step" | js .generator); out=$(echo "$step" | js .output)
  : > "$work/out"
  split_path=$(echo "$step" | js .split)
  each_path=$(echo "$step" | js .each.file)
  globs=$(echo "$step" | js .glob)
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
      done
    done
  elif [ -n "$each_path" ]; then
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
