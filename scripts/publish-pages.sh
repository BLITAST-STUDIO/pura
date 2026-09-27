#!/bin/sh
# Place a built dist/ into a gh-pages checkout (HOSTING.md).
#   scripts/publish-pages.sh stable <gh-pages clone>   → the root: the version shared with family and friends
#   scripts/publish-pages.sh next   <gh-pages clone>   → /next/: trials (build with VITE_CHANNEL=next)
# Stable keeps next/ in place; next touches only next/. Commit and push are left to the caller.
set -eu
channel=$1; pages=$2; src=$(git rev-parse HEAD)
[ -d dist ] && [ -d "$pages/.git" ] || { echo "run from the repo root after a build, with a gh-pages clone" >&2; exit 1; }
if [ "$channel" = stable ]; then
  find "$pages" -mindepth 1 -maxdepth 1 ! -name .git ! -name next -exec rm -rf {} +
  cp -R dist/. "$pages/"
  touch "$pages/.nojekyll"
  printf '{\n  "channel": "stable",\n  "sourceCommit": "%s"\n}\n' "$src" > "$pages/build-info.json"
elif [ "$channel" = next ]; then
  rm -rf "$pages/next"; mkdir -p "$pages/next"
  cp -R dist/. "$pages/next/"
  # Its own name on the home screen.
  sed -i.bak 's/"name": "PURA"/"name": "PURA 試作"/; s/"short_name": "PURA"/"short_name": "PURA試作"/' "$pages/next/manifest.webmanifest" && rm "$pages/next/manifest.webmanifest.bak"
  printf '{\n  "channel": "next",\n  "sourceCommit": "%s"\n}\n' "$src" > "$pages/next/build-info.json"
  touch "$pages/.nojekyll"
else
  echo "channel must be stable or next" >&2; exit 1
fi
echo "placed $channel from $src"
