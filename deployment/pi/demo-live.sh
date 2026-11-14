#!/usr/bin/env bash
# Live-demo mode for the gateway Pi (run ON the Pi, as the normal user).
#   deployment/pi/demo-live.sh on    upload new packets every second and judge node freshness against a 5 s period
#   deployment/pi/demo-live.sh off   back to the normal 10 s upload poll and the 5 minute node period
#   deployment/pi/demo-live.sh       show the current mode
#
# It writes systemd drop-ins (it never edits the installed unit files) and restarts the two services it changes.
# The nodes must also send faster than their normal 5 minutes; that is set in the node firmware, not here.
# Open the website with ?live to have it re-read node data every second (https://aeios-seven.vercel.app/?live).
set -euo pipefail

UNITS="${AEIOS_UNITS:-$HOME/.config/systemd/user}"
UP="$UNITS/aeios-uploader.service.d"
DASH="$UNITS/aeios-dashboard.service.d"
FILE="demo-live.conf"

case "${1:-status}" in
  on)
    mkdir -p "$UP" "$DASH"
    printf '[Service]\nExecStart=\nExecStart=/usr/bin/python3 -u %%h/gateway/uploader.py --poll 1 --heartbeat 10\n' > "$UP/$FILE"
    printf '[Service]\nEnvironment=AEIOS_PERIOD_S=5\n' > "$DASH/$FILE"
    ;;
  off)
    rm -f "$UP/$FILE" "$DASH/$FILE"
    rmdir "$UP" "$DASH" 2>/dev/null || true
    ;;
  status)
    if [ -f "$UP/$FILE" ]; then echo "live demo mode: ON (uploader --poll 1, dashboard period 5 s)"; else echo "live demo mode: OFF"; fi
    exit 0
    ;;
  *) echo "usage: $0 on|off" >&2; exit 2 ;;
esac

systemctl --user daemon-reload
systemctl --user restart aeios-uploader aeios-dashboard
sleep 2
for s in uploader dashboard; do printf '%-10s %s\n' "$s" "$(systemctl --user is-active "aeios-$s")"; done
"$0" status
