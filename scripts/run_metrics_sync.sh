#!/bin/sh
# Invoked from the system crontab once a minute; the interval lives in Django.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON="$ROOT/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="$ROOT/backend/.venv/bin/python"
fi
if [ ! -x "$PYTHON" ]; then
  echo "Metrics sync skipped: activate a Python virtual environment in the project." >&2
  exit 1
fi
mkdir -p "$ROOT/logs"
cd "$ROOT/backend"
"$PYTHON" manage.py sync_metrics_due >> "$ROOT/logs/metrics-cron.log" 2>&1
