#!/bin/sh
# Runs every step of generators/pipeline.json through the generator programs.
# Each program is a LexLean text/3 application, generators/<program>/, built by
# `prismpm build` and pinned by tools/generators/build.sh. Their Foundation is
# one module set, generators/foundation/, copied byte for byte into each.
#   tools/generators/run.sh          write each step's output
#   tools/generators/run.sh --check  fail when a committed output differs (GN-01)
#   tools/generators/run.sh --lock P record program P's sources and binary (build.sh)
# A request is "<generator> <output>\n" and a ustar archive of the step's inputs,
# and must fit the request bound. A step with "split" runs once per piece of that
# file, cut at line ends (only before a line matching "breakBefore", where given); a step with "each" runs once per element of a JSON array;
# either way its output is the outputs joined in order. Outputs under .gen/ are
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

# pin PATH: a pinned upstream file a step names under "pinned" ({"file", "entries"}: each entry an
# object of the file with its path, url and sha256), fetched once into a cache and refused if its
# bytes are not the pinned ones. Every other path is the repository's own file.
cache=${PRISM_PIN_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/prism-pins}
pins() { # pins STEP -> "path url sha256" lines
  pf=$(echo "$1" | js .pinned.file); [ -n "$pf" ] || return 0
  for e in $(echo "$1" | js .pinned.entries); do
    js "$e" < "$pf" | python3 -I -c 'import json, sys
for l in sys.stdin:
    v = json.loads(l); print(v["path"], v["url"], v["sha256"])'
  done
}
source_of() { # source_of STEP PATH -> the file to stage for PATH
  line=$(pins "$1" | awk -v p="$2" '$1 == p')
  if [ -z "$line" ]; then printf '%s\n' "$2"; return; fi
  set -- $line; mkdir -p "$cache"
  if [ ! -f "$cache/$3" ]; then
    python3 -I -c 'import sys, urllib.request
with urllib.request.urlopen(sys.argv[1], timeout=60) as r: open(sys.argv[2], "wb").write(r.read())' "$2" "$cache/$3.part"
    mv "$cache/$3.part" "$cache/$3"
  fi
  if [ "$(sha256sum < "$cache/$3" | cut -c1-64)" != "$3" ]; then
    rm -f "$cache/$3"; echo "GN-01: $2 is not the pinned $3" >&2; exit 1
  fi
  printf '%s\n' "$cache/$3"
}

steps=$(js .steps < generators/pipeline.json)
echo "$steps" | while read -r step; do
  program=$(echo "$step" | js .program); gen=$(echo "$step" | js .generator); out=$(echo "$step" | js .output)
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
    from=$(source_of "$step" "$split_path")
    brk=$(echo "$step" | js .breakBefore)
    if [ -n "$brk" ]; then
      # Pieces end only before a line that matches: a unit (a section, a record) is never cut.
      python3 -I -c 'import re, sys
data, rx, bound, out = open(sys.argv[1], "rb").read(), re.compile(sys.argv[2].encode()), int(sys.argv[3]), sys.argv[4]
units, cur = [], b""
lines = data.split(b"\n")
for line in [l + b"\n" for l in lines[:-1]] + ([lines[-1]] if lines[-1] else []):
    if cur and rx.search(line):
        units.append(cur); cur = b""
    cur += line
units += [cur] if cur else []
pieces, piece = [], b""
for u in units:
    if len(u) > bound:
        sys.exit(f"GN-01: {sys.argv[1]}: a unit of {len(u)} bytes is over the bound {bound}: {u[:60]!r}")
    if piece and len(piece) + len(u) > bound:
        pieces.append(piece); piece = b""
    piece += u
pieces += [piece] if piece else []
for i, p in enumerate(pieces):
    open(f"{out}{i:04d}", "wb").write(p)' "$from" "$brk" "$piece" "$work/pieces/p."
    else
      split -C "$piece" -d -a 4 "$from" "$work/pieces/p."
    fi
    for p in "$work/pieces"/p.*; do
      rm -rf "$work/stage"; mkdir -p "$work/stage/$(dirname "$split_path")"
      cp "$p" "$work/stage/$split_path"
      run "$gen" "$out" "$work/stage" "$split_path"
    done
  else
    rm -rf "$work/stage"; mkdir -p "$work/stage"
    for f in $(echo "$step" | js .inputs); do
      mkdir -p "$work/stage/$(dirname "$f")"; cp "$(source_of "$step" "$f")" "$work/stage/$f"
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
