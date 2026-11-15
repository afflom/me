#!/bin/sh
# Build the generators program (generators/, a LexLean text/3 application) in the
# locked SDK with no network, and pin it: generators/bin/prism-generators and
# generators/lock.json, which tools/generators/run.sh --check holds (GN-01).
#   SDK=<image> tools/generators/build.sh
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SDK=${SDK:?set SDK to the PrismPM SDK image}
work=$(mktemp -d)
cp -r "$ROOT/generators/." "$work/"
rm -rf "$work/bin" "$work/.lexlean" "$work/.prism"
docker run --rm -u 0 --network none -v "$work:/w" -w /w --entrypoint sh "$SDK" -c \
  "lexlean lock && lexlean fmt --all && lexlean lock && lexlean verify && prismpm build --no-provenance"
cp -r "$work/src/." "$ROOT/generators/src/"
cp "$work/lexlean.lock" "$ROOT/generators/lexlean.lock"
mkdir -p "$ROOT/generators/bin"
cp "$(ls "$work"/.prism/build/*/cli/bin/x86_64-unknown-linux-musl/prism-generators | head -n 1)" "$ROOT/generators/bin/prism-generators"
cd "$ROOT" && tools/generators/run.sh --lock
