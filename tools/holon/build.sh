#!/bin/sh
# Builds the observer's standalone guests in the locked SDK image, with no
# network, and pins them: python3 -I tools/holon/gen.py first.
set -eu
cd "$(dirname "$0")/../.."
IMG=$(python3 -c "import json;print(json.load(open('prismpm.lock'))['sdk_image'])")
S=$(mktemp -d)
for f in holon curate; do
  python3 -I tools/holon/standalone.py "$f" "$S/$f" >/dev/null
  docker run --rm -u 0 --network none -v "$S/$f:/w" -w /w --entrypoint sh "$IMG" -c 'lexlean lock && lexlean fmt && lexlean lock && lexlean verify && prismpm build'
  cp "$S/$f"/.prism/build/*/core-wasm/prism_"$f"_core_wasm.wasm "site/holon/guest/$f.wasm"
done
python3 - <<'PY'
import hashlib, re
p = 'site/holon/guest.mjs'
t = open(p).read()
for f in ('holon', 'curate'):
    h = hashlib.sha256(open(f'site/holon/guest/{f}.wasm', 'rb').read()).hexdigest()
    t = re.sub(rf"({f}: {{ path: 'guest/{f}.wasm', sha256: ')[0-9a-f]{{64}}", rf"\g<1>{h}", t)
open(p, 'w').write(t)
PY
rm -rf "$S"
