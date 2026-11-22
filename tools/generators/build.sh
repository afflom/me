#!/bin/sh
# Build one generator program (generators/PROGRAM, a LexLean text/3 application)
# in the locked SDK with no network, and pin it: generators/PROGRAM/bin (the
# program for x86-64 and, as prism-generators.aarch64, for arm64) and
# generators/PROGRAM/lock.json, which tools/generators/run.sh --check holds (GN-01).
#   SDK=<image> tools/generators/build.sh PROGRAM
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SDK=${SDK:?set SDK to the PrismPM SDK image}
P=${1:?name the program, a directory of generators/}
D="$ROOT/generators/$P"
mkdir -p "$D/src/Foundation" && cp -r "$ROOT/generators/foundation/." "$D/src/Foundation/"
work=$(mktemp -d)
cp -r "$D/." "$work/"
rm -rf "$work/bin" "$work/.lexlean" "$work/.prism"
docker run --rm -u 0 --network none -v "$work:/w" -w /w --entrypoint sh "$SDK" -c \
  "lexlean lock && lexlean fmt --all && lexlean lock && lexlean verify && prismpm build --no-provenance"
cp -r "$work/src/." "$D/src/"
cp "$work/lexlean.lock" "$D/lexlean.lock"
mkdir -p "$D/bin"
cp "$(ls "$work"/.prism/build/*/cli/bin/x86_64-unknown-linux-musl/prism-generators | head -n 1)" "$D/bin/prism-generators"
cp "$(ls "$work"/.prism/build/*/cli/bin/aarch64-unknown-linux-musl/prism-generators | head -n 1)" "$D/bin/prism-generators.aarch64"
cd "$ROOT" && tools/generators/run.sh --lock "$P"
