#!/usr/bin/env bash
# Sanal COM port çifti açar ve simülatörü bir uca bağlar.
# Diğer ucu uygulamana veya test scriptine ver.

cd "$(dirname "$0")/.."

TMPLOG=$(mktemp)
socat -d -d pty,raw,echo=0 pty,raw,echo=0 2>"$TMPLOG" &
SOCAT_PID=$!
sleep 0.5

PTY1=$(grep "PTY is" "$TMPLOG" | awk '{print $NF}' | sed -n '1p')
PTY2=$(grep "PTY is" "$TMPLOG" | awk '{print $NF}' | sed -n '2p')
rm -f "$TMPLOG"

echo ""
echo "  Port 1: $PTY1"
echo "  Port 2: $PTY2"
echo ""

trap "kill $SOCAT_PID 2>/dev/null; exit" INT TERM
wait $SOCAT_PID
