#!/bin/sh
set -eu
MARKER='# MY_PERIOD_KIT_METRICS_V036'
EXISTING=$(crontab -l 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  printf '%s\n' "$EXISTING" | grep -v -F "$MARKER" | crontab - || true
fi
echo 'My Period Kit metrics cron entry removed; database and saved data unchanged.'
