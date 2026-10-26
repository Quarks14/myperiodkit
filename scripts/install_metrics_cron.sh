#!/bin/sh
# Installs exactly one system cron line; schedule changes are managed in the UI.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SCRIPT="$ROOT/scripts/run_metrics_sync.sh"
MARKER='# MY_PERIOD_KIT_METRICS_V036'
if [ ! -x "$ROOT/.venv/bin/python" ] && [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  echo 'Virtual environment missing. Install backend requirements first.' >&2
  exit 1
fi
# Absolute paths with spaces are safe when wrapped in double quotes for cron.
case "$SCRIPT" in
  *'"'*) echo 'Project path contains a quotation mark and cannot be installed automatically.' >&2; exit 1;;
esac
EXISTING=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$EXISTING" | grep -v -F "$MARKER" || true
  printf '%s\n' "* * * * * /bin/sh \"$SCRIPT\" $MARKER"
} | sed '/^$/d' | crontab -
echo 'Metrics cron installed: checks the database schedule every minute.'
echo 'Open Data collection in the admin dashboard to choose the actual pull interval.'
echo "Log: $ROOT/logs/metrics-cron.log"
