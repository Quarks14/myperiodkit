# v0.3.6 Verification Record

## Checks completed in the packaging environment
- Python source compilation via `python3 -m compileall -q backend`: passed.
- TypeScript/TSX syntax parsing with TypeScript 5.8.3: passed.
- CSS parsing with PostCSS: passed.
- Shell syntax parsing via `sh -n scripts/*.sh`: passed.
- Archive integrity and path inspection: performed during packaging.
- New automated regression tests were written in `backend/metrics/test_scheduled_sync_v036.py` for
  default cadence, database persistence, scheduler due checks, pause/re-enable,
  invalid values, administrator-only settings, overlapping pulls, errors retaining
  last good snapshot, and a management-command cron tick.

## Checks that must run locally
- Full Django test suite and migration checks: not run here. The package registry
  is inaccessible in the packaging environment, so Django could not be installed.
- Full frontend `npm run build`: not run here; project Node modules are unavailable.
- Actual 5-minute OS cron execution: requires the user's macOS machine with the
  virtual environment installed.
- Authenticated upstream pull: not run here; API credentials are not available.

## Manual acceptance checks after installation
1. Apply the migration and pass `python manage.py test accounts metrics --noinput`.
2. Install the cron entry with `bash scripts/install_metrics_cron.sh`.
3. Check Data collection shows 'Cron running' within about two minutes.
4. Verify the first completed sync populates the overview with a true snapshot timestamp.
5. Set the interval to 10 minutes; verify next due changes and crontab stays once/minute.
6. Run a manual pull and verify last-success and history update.
7. Pause scheduled pulls, observe no automatic new run, then resume.
8. Verify failed pulls preserve the last loaded reports.
9. Verify viewer and analyst accounts cannot see or access schedule modification.
10. Verify only the latest source snapshot, not user records, appears in sync history.
