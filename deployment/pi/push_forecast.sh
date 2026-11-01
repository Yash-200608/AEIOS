#!/usr/bin/env bash
# Install or update the PM2.5 forecast service on the Pi FROM A WORKSTATION (the Pi has no repository checkout).
#   AEIOS_PI=user@host [AEIOS_PI_KEY=~/.ssh/pi_gateway] deployment/pi/push_forecast.sh [--dry-run] [--enable]
#
# Copies the inference code, the newest verified model, the station list and the systemd units to ~/aeios_ai on the Pi, creates
# the venv (numpy + lightgbm only) if missing, and installs the units. It never touches ~/gateway, gateway.db, uploader.env
# or an existing forecast.env / forecasts.db. The hourly timer is only enabled with --enable, and OPENAQ_API_KEY must be put
# into ~/.config/aeios/forecast.env on the Pi by hand (the script never reads or sends your key).
set -euo pipefail

DRY=0; ENABLE=0
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; --enable) ENABLE=1 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done
: "${AEIOS_PI:?set AEIOS_PI=user@host}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$HERE/../.."
KEYOPT=(); [ -n "${AEIOS_PI_KEY:-}" ] && KEYOPT=(-i "$AEIOS_PI_KEY")
SSH=(ssh "${KEYOPT[@]}" -o BatchMode=yes "$AEIOS_PI"); SCP=(scp "${KEYOPT[@]}" -o BatchMode=yes)
PY="$ROOT/ai/.venv/Scripts/python"; [ -x "$PY" ] || PY="$ROOT/ai/.venv/bin/python"; [ -x "$PY" ] || PY=python3

MODEL_DIR="$(ls -d "$ROOT"/ai/models/registry/pm25_lgbm_cqr/v* 2>/dev/null | sort | tail -n 1)"
[ -n "$MODEL_DIR" ] && [ -d "$MODEL_DIR/h1" ] || { echo "no trained model with weights in ai/models/registry (run ai.training.benchmark --register)" >&2; exit 1; }
VERSION="$(basename "$MODEL_DIR")"

STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/ai/models/registry/pm25_lgbm_cqr" "$STAGE/units"
cp "$ROOT/ai/__init__.py" "$STAGE/ai/"
for d in feature_engineering preprocessing inference explainability service; do cp -r "$ROOT/ai/$d" "$STAGE/ai/$d"; done
find "$STAGE" -name __pycache__ -prune -exec rm -rf {} +
cp -r "$MODEL_DIR" "$STAGE/ai/models/registry/pm25_lgbm_cqr/$VERSION"
cp "$ROOT/ai/requirements-runtime.txt" "$STAGE/"
cp "$ROOT/edge/v0/systemd/aeios-forecast.service" "$ROOT/edge/v0/systemd/aeios-forecast.timer" "$STAGE/units/"
cp "$HERE/forecast.env.example" "$STAGE/"
(cd "$ROOT" && "$PY" -m ai.service.stations --out "$STAGE/stations.json" --model-dir "$MODEL_DIR" --nodes deployment/pi/v0_nodes.example.json)
tar -C "$STAGE" -cf "$STAGE/bundle.tar" ai requirements-runtime.txt stations.json units forecast.env.example

echo "Target : $AEIOS_PI:~/aeios_ai   model $VERSION   bundle $(du -h "$STAGE/bundle.tar" | cut -f1)   enable timer: $([ $ENABLE = 1 ] && echo yes || echo no)"
if [ "$DRY" = 1 ]; then echo "[dry-run] would copy the bundle, extract it, create the venv if missing, install units"; exit 0; fi

"${SCP[@]}" "$STAGE/bundle.tar" "$AEIOS_PI:/tmp/aeios_forecast_bundle.tar"
"${SSH[@]}" ENABLE=$ENABLE bash -s <<'REMOTE'
set -euo pipefail
D="$HOME/aeios_ai"; CONF="$HOME/.config/aeios"; UNITS="$HOME/.config/systemd/user"
mkdir -p "$D" "$CONF" "$UNITS"
rm -rf "$D/ai"                                   # code is replaced wholesale; forecasts.db, .venv and stations are kept/updated
tar -C "$D" -xf /tmp/aeios_forecast_bundle.tar ai requirements-runtime.txt stations.json
tar -C /tmp -xf /tmp/aeios_forecast_bundle.tar units forecast.env.example
[ -x "$D/.venv/bin/python" ] || python3 -m venv "$D/.venv"
"$D/.venv/bin/pip" install -q -r "$D/requirements-runtime.txt"
install -m 0644 /tmp/units/aeios-forecast.service /tmp/units/aeios-forecast.timer "$UNITS/"
[ -f "$CONF/forecast.env" ] || install -m 0600 /tmp/forecast.env.example "$CONF/forecast.env"
rm -rf /tmp/units /tmp/forecast.env.example /tmp/aeios_forecast_bundle.tar
systemctl --user daemon-reload
if ! grep -q '^OPENAQ_API_KEY=.' "$CONF/forecast.env"; then echo "NOTE: put OPENAQ_API_KEY=... into $CONF/forecast.env before the first run"; fi
if [ "${ENABLE:-0}" = 1 ]; then systemctl --user enable --now aeios-forecast.timer; systemctl --user list-timers aeios-forecast.timer --no-pager; fi
echo "installed model: $(ls "$D/ai/models/registry/pm25_lgbm_cqr")"
REMOTE
