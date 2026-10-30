#!/usr/bin/env bash
# Install or update the v0 field prototype on the Raspberry Pi gateway (run ON the Pi, as the normal user).
#   deployment/pi/install.sh            copy code, install units, enable and (re)start services
#   deployment/pi/install.sh --dry-run  print what would happen, change nothing
#
# Code only: never touches gateway.db, *_state.json, smoke_cache/, ml/model_state*.json or
# ~/.config/aeios/uploader.env (the cloud credentials).
set -euo pipefail

DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../../edge/v0"
DEST="${AEIOS_DEST:-$HOME/gateway}"
UNITS="${AEIOS_UNITS:-$HOME/.config/systemd/user}"
CONF="${AEIOS_CONF:-$HOME/.config/aeios}"
SERVICES="receiver model dashboard uploader smoke"

run() { if [ "$DRY" = 1 ]; then echo "[dry-run] $*"; else "$@"; fi; }

[ -d "$SRC" ] || { echo "edge/v0 not found next to this script ($SRC)" >&2; exit 1; }

echo "Code   : $SRC -> $DEST"
run mkdir -p "$DEST/ml" "$UNITS" "$CONF"
for f in receiver.py gwdb.py dashboard.py uploader.py smoke_watch.py simulate.py lora_diag.py; do
  run install -m 0755 "$SRC/$f" "$DEST/$f"
done
for f in live.py online_model.py synth.py test_ml.py train.py README.md; do
  run install -m 0644 "$SRC/ml/$f" "$DEST/ml/$f"
done

echo "Units  : $UNITS"
for s in $SERVICES; do run install -m 0644 "$SRC/systemd/aeios-$s.service" "$UNITS/aeios-$s.service"; done

if [ ! -f "$CONF/uploader.env" ]; then
  echo "Config : creating $CONF/uploader.env from the example - EDIT IT, then restart aeios-uploader"
  run install -m 0600 "$HERE/uploader.env.example" "$CONF/uploader.env"
else
  echo "Config : $CONF/uploader.env exists, left untouched"
fi

if command -v systemctl >/dev/null 2>&1 && [ "$DRY" = 0 ] && [ -z "${AEIOS_NO_SYSTEMD:-}" ]; then
  systemctl --user daemon-reload
  for s in $SERVICES; do systemctl --user enable "aeios-$s" >/dev/null; systemctl --user restart "aeios-$s"; done
  sleep 3
  for s in $SERVICES; do printf '%-10s %s\n' "$s" "$(systemctl --user is-active "aeios-$s")"; done
else
  echo "systemd: skipped (dry run or no systemctl)"
fi
echo "Note   : for services to start at boot without a login, run once: sudo loginctl enable-linger ${USER:-$(id -un)}"
