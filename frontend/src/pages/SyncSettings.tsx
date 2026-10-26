import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Database, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { api, type SyncStatus } from '../lib/api';

const choices = [
  { minutes: 1, label: 'Every minute' },
  { minutes: 5, label: 'Every 5 minutes' },
  { minutes: 10, label: 'Every 10 minutes' },
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Every day' },
];

const displayTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not yet';

export default function SyncSettings({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [interval, setIntervalMinutes] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState<'save' | 'run' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchStatus = useCallback(async (updateForm = false) => {
    try {
      const current = await api<SyncStatus>('metrics/sync/settings/');
      setStatus(current);
      if (updateForm) {
        setIntervalMinutes(current.interval_minutes);
        setCustom(!choices.some((item) => item.minutes === current.interval_minutes));
        setEnabled(current.enabled);
      }
    } catch (reason) {
      setError((reason as Error).message || 'Unable to read sync settings.');
    }
  }, []);

  useEffect(() => {
    void fetchStatus(true);
    const timer = window.setInterval(() => {
      if (!document.hidden) void fetchStatus();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  async function save() {
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
      setError('Enter a whole-number interval between 1 and 1440 minutes.');
      return;
    }
    setBusy('save'); setError(''); setNotice('');
    try {
      const next = await api<SyncStatus>('metrics/sync/settings/', {
        method: 'PATCH', body: JSON.stringify({ interval_minutes: interval, enabled }),
      });
      setStatus(next);
      setNotice('Schedule updated. The next cron tick will read the new settings.');
    } catch (reason) {
      setError((reason as Error).message || 'Unable to save sync settings.');
    } finally { setBusy(''); }
  }

  async function syncNow() {
    setBusy('run'); setError(''); setNotice('');
    try {
      const result = await api<{ detail: string; sync: SyncStatus }>('metrics/sync/run/', { method: 'POST' });
      setStatus(result.sync);
      setNotice(result.detail);
      onSynced();
    } catch (reason) {
      setError((reason as Error).message || 'Unable to run metrics sync.');
      await fetchStatus();
    } finally { setBusy(''); }
  }

  return (
    <div className="sync-settings-layout">
      <div className="sync-summary-grid">
        <div className="panel sync-status-card">
          <span className="sync-label"><Clock3 size={18} /> Scheduled collection</span>
          <strong>{status ? (status.enabled ? `Every ${status.interval_minutes} minute${status.interval_minutes === 1 ? '' : 's'}` : 'Paused') : 'Loading...'}</strong>
          <span>{status?.cron_active ? 'Cron running on this computer' : 'Cron not detected in the last 2.5 minutes'}</span>
        </div>
        <div className="panel sync-status-card">
          <span className="sync-label"><CheckCircle2 size={18} /> Last successful pull</span>
          <strong>{displayTime(status?.last_success_at)}</strong>
          <span>{status?.record_count == null ? 'No saved data yet' : `${status.record_count} records in the saved snapshot`}</span>
        </div>
        <div className="panel sync-status-card">
          <span className="sync-label"><Database size={18} /> Next scheduled pull</span>
          <strong>{status?.enabled ? displayTime(status?.next_run_at) : 'Paused'}</strong>
          <span>{status?.running ? 'A pull is currently running' : `Last attempt: ${displayTime(status?.last_attempt_at)}`}</span>
        </div>
      </div>

      <div className="sync-settings-grid">
        <section className="panel sync-settings-form">
          <div className="panel-heading"><div><h3>Collection schedule</h3><p>Choose how often the metrics source is checked.</p></div></div>
          <label className="sync-field" htmlFor="sync-interval">Pull frequency
            <select id="sync-interval" value={custom ? 0 : interval} onChange={(event) => {
              const next = Number(event.target.value);
              if (next === 0) setCustom(true);
              else { setCustom(false); setIntervalMinutes(next); }
            }} disabled={!!busy}>
              {choices.map((item) => <option value={item.minutes} key={item.minutes}>{item.label}</option>)}
              <option value={0}>Custom interval</option>
            </select>
          </label>
          {custom && <label className="sync-field" htmlFor="sync-custom">Interval in minutes (1 to 1440)
            <input id="sync-custom" type="number" value={interval} min={1} max={1440} step={1}
              onChange={(event) => setIntervalMinutes(event.target.value === '' ? 0 : Number(event.target.value))} disabled={!!busy} />
          </label>}
          <label className="sync-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={!!busy} />
            <span><strong>Enable scheduled pulls</strong><small>When off, existing reports remain available from the last saved snapshot.</small></span>
          </label>
          <div className="sync-actions">
            <button className="btn btn-primary" type="button" disabled={!!busy || !status} onClick={() => void save()}>
              <Save size={17} /> Save schedule
            </button>
            <button className="btn btn-outline" type="button" disabled={!!busy || status?.running} onClick={() => void syncNow()}>
              <RefreshCw size={17} className={busy === 'run' ? 'spin' : ''} /> Pull now
            </button>
          </div>
          {notice && <div className="sync-feedback success" role="status"><CheckCircle2 size={16} />{notice}</div>}
          {error && <div className="sync-feedback error" role="alert"><AlertCircle size={16} />{error}</div>}
          {status?.last_error && <div className="sync-feedback error" role="status"><AlertCircle size={16} />Last pull failed: {status.last_error}. Previous data remains available.</div>}
          <p className="sync-footnote"><ShieldCheck size={16} /> Only administrators can change the schedule or pull data manually. The cron job checks these settings every minute; no Django restart is required after changing the interval.</p>
          {!status?.cron_active && <p className="sync-footnote">To start automatic collection on your Mac, run <code>bash scripts/install_metrics_cron.sh</code> from the project root after applying migrations.</p>}
        </section>

        <section className="panel sync-history">
          <div className="panel-heading"><div><h3>Recent pulls</h3><p>Result and record count for the last ten attempts.</p></div>
            <button type="button" className="sync-reload" aria-label="Refresh sync history" onClick={() => void fetchStatus()}><RefreshCw size={18} /></button>
          </div>
          <div className="sync-history-scroll">
            {status?.history?.length ? <table>
              <thead><tr><th>When</th><th>Type</th><th>Result</th><th>Records</th></tr></thead>
              <tbody>{status.history.map((run) => <tr key={run.id}>
                <td>{displayTime(run.started_at)}</td>
                <td>{run.trigger === 'scheduled' ? 'Scheduled' : run.trigger === 'manual' ? 'Manual' : 'Initial'}</td>
                <td><span className={`sync-result ${run.outcome === 'succeeded' ? 'ok' : 'failed'}`}>{run.outcome === 'succeeded' ? 'Success' : 'Failed'}</span></td>
                <td>{run.record_count ?? '—'}</td>
              </tr>)}</tbody>
            </table> : <p className="sync-no-history">No collection attempts have been recorded yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
