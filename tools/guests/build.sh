#!/bin/sh
# Rebuild every stale decision guest (or the ids given) in the locked SDK, with no
# network, and record each core wasm: python3 -I tools/guests/gen.py check then holds.
#   SDK=<image> tools/guests/build.sh [ID...]
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SDK=${SDK:?set SDK to the PrismPM SDK image}
WORK=${WORK:-$(mktemp -d)}
IDS=${*:-$(python3 -I "$ROOT/tools/guests/gen.py" stale)}
for id in $IDS; do
  dir="$WORK/$id"
  python3 -I "$ROOT/tools/guests/gen.py" write "$id" "$dir" >/dev/null
  docker run --rm -u 0 --network none -v "$dir:/w" -w /w --entrypoint sh "$SDK" -c \
    "lexlean lock && lexlean fmt --all && lexlean lock && lexlean verify && prismpm build --no-provenance; status=\$?; chown -R $(id -u):$(id -g) /w; exit \$status"
  python3 -I "$ROOT/tools/guests/gen.py" record "$id" "$(ls "$dir"/.prism/build/*/core-wasm/*.wasm | head -n 1)"
  rm -rf "$dir"
done
