#!/usr/bin/env bash
set -euo pipefail

VENDOR=${1:-simcom}
TMPLOG=$(mktemp)

cd "$(dirname "$0")/.."

cleanup() {
  kill "$SOCAT_PID" 2>/dev/null || true
  rm -f "$TMPLOG" /tmp/ttyUART0 /tmp/ttyUART1
}
trap cleanup EXIT INT TERM

PTY1=/tmp/ttyUART0
PTY2=/tmp/ttyUART1
rm -f "$PTY1" "$PTY2"

socat -d -d \
  pty,raw,echo=0,link="$PTY1",mode=666 \
  pty,raw,echo=0,link="$PTY2",mode=666 2>"$TMPLOG" &
SOCAT_PID=$!
sleep 0.5

echo ""
echo "  Uygulamayı bu porta bağla : $PTY1"
echo "  Test bu porta gönderecek  : $PTY2"
echo ""
read -rp "Uygulamayı bağladıktan sonra Enter'a bas..."
echo ""

bash scripts/test-modem-socat.sh --pty "$PTY2" --vendor "$VENDOR"
