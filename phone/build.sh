#!/usr/bin/env bash
# phone/build.sh — builds a single self-contained offline HTML from phone/*.md.
#
# Output: phone/build/cocodona-phone.html
#
# Sync to Pixel:
#   1. USB-connect phone, file-transfer mode
#   2. Drag phone/build/cocodona-phone.html → Internal storage/Download/
#   3. On phone: Files by Google → Downloads → tap file → "Open with Chrome"
#   4. ⋮ menu → Add to Home screen for one-tap access
#
# The output is a true local file. Reload-safe in airplane mode (no network deps).

set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build

# One-time: install marked into phone/node_modules. Subsequent runs skip.
if [ ! -d node_modules/marked ]; then
  echo "→ Installing marked (one time, needs internet)..."
  npm install --silent --no-fund --no-audit
fi

node build.mjs

OUT="build/cocodona-phone.html"
SIZE=$(wc -c < "$OUT" | tr -d ' ')
printf "✓ %s (%s bytes)\n" "$OUT" "$SIZE"
printf "  → USB-copy to Pixel: Internal storage/Download/\n"
