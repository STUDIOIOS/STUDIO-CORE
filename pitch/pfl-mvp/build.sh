#!/usr/bin/env bash
# Re-render the PFL x MVP one-pager to PDF.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/pfl-mvp-artist-series.html"
OUT="$DIR/STUDIO_IOS_PFL_MVP_ARTIST_SERIES_ONE_PAGER.pdf"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)" \
    /opt/pw-browsers/chromium*/chrome-linux/chrome
  do
    [ -x "$c" ] && CHROME="$c" && break
  done
fi

if [ -z "$CHROME" ]; then
  echo "No Chrome or Chromium found. Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --virtual-time-budget=6000 --print-to-pdf="$OUT" "file://$SRC"

echo "Wrote $OUT"
