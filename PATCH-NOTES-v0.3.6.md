# My Period Kit Insights Portal v0.3.6: scheduled data collection

Adds a real once-per-minute **system cron tick** that reads an administrator-configurable
interval (default: **every five minutes**) stored in the Django database.
The dashboard and cron process now share a durable last-successful data snapshot.
Changing the interval from **Data collection** takes effect without restarting Django
or modifying crontab. The initial cron tick pulls immediately; subsequent pulls
follow the configured interval. Disabling automatic sync retains the last good data.

## Update safely on your Mac

From the existing project root (`~/Documents/Project/periodkit-insights-starter`):

```bash
# Optional backup, before unzipping the patch
mkdir -p backups
cp backend/db.sqlite3 backups/db-pre-v0.3.6.sqlite3

unzip -o ~/Downloads/periodkit-insights-v0.3.6-scheduled-sync-patch.zip -d .
source .venv/bin/activate
cd backend
python manage.py check
python manage.py migrate
python manage.py makemigrations --check --dry-run
python manage.py test accounts metrics --noinput
cd ../frontend
npm run build
cd ..

# Install one system cron entry, after checking that the tests pass
bash scripts/install_metrics_cron.sh
crontab -l
```

Restart your Django server if it is already running. The Vite frontend normally
hot-reloads. To trigger a one-time diagnostic sync from a terminal:

```bash
cd backend
../.venv/bin/python manage.py sync_metrics_due --force
```

Open **Staff login > Data collection** (administrator account). You can choose
1, 5, 10, 15, 30, 60, 120, 360, 720 or 1440 minutes, pause scheduled pulls,
view last success/next due/recent results, and click **Pull now**.

### Behaviour

- Cron runs **once every minute**, but only contacts the upstream API when due.
- Backend interval settings are read on each cron tick, not stored in the system crontab.
- All dashboard pages read the **same database snapshot**. A browser refresh does
  not itself trigger an upstream call when a snapshot exists.
- The overview's **Refresh** button still makes an immediate admin pull.
- The initial report request may bootstrap the first snapshot if none exists.
- A failed pull does **not** erase the previous snapshot. The UI shows failure
  history and last successful pull time.
- Pulls are protected by a database-level claim; simultaneous cron/manual calls
  cannot run the same sync concurrently.
- The upstream *full source CSV* download still fetches a fresh CSV on demand;
  that is separate from the scheduled JSON snapshot.
- Scheduled snapshots contain personally identifiable participant data. Protect
  `db.sqlite3`, backups and machine access. The patch does **not** include any
  database file, `.env`, or credentials.
- HTTP Basic Authentication on an HTTP URL is **not encrypted**. Move upstream
  access to HTTPS or a secure private connection before production use.
- On macOS, cron may need permission to read a project stored in Documents;
  if **Data collection** shows *cron not detected*, examine `logs/metrics-cron.log`.

### Stop scheduled collection

```bash
bash scripts/uninstall_metrics_cron.sh
```

You can also pause the sync from the Data collection page without removing cron.

### Verification

Run `python manage.py test metrics.test_scheduled_sync_v036` for focused tests.
This patch changes only the files included in the ZIP. It does not replace the
local database, administrator users, API credentials or existing design tokens.
