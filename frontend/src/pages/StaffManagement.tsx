import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity, Check, ChevronLeft, ChevronRight, CircleUserRound,
  KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import {
  api, type Account, type AuditRecord, type Role, type RoleMatrix,
  type StaffList, type StaffRecord,
} from '../lib/api';

type Tab = 'accounts' | 'roles' | 'activity';
type Editor = 'create' | 'edit' | 'reset' | null;
type StaffForm = { username: string; first_name: string; last_name: string; email: string; role: Role; is_active: boolean; password: string };
const emptyForm = (): StaffForm => ({ username: '', first_name: '', last_name: '', email: '', role: 'viewer', is_active: true, password: '' });
const roleNames: Role[] = ['admin', 'analyst', 'viewer'];
const readableDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';
const prettyAction = (action: string) => ({
  'staff.created': 'Staff account created',
  'staff.updated': 'Staff account updated',
  'staff.password_reset': 'Staff password reset',
  'password.changed': 'Password changed',
  'metrics.records_exported': 'Participant CSV downloaded',
} as Record<string, string>)[action] ?? action;

export default function StaffManagement({ account }: { account: Account }) {
  const [tab, setTab] = useState<Tab>('accounts');
  const [staff, setStaff] = useState<StaffList | null>(null);
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null);
  const [events, setEvents] = useState<AuditRecord[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [staffDateField, setStaffDateField] = useState<'date_joined' | 'last_login'>('date_joined');
  const [staffDateFrom, setStaffDateFrom] = useState('');
  const [staffDateTo, setStaffDateTo] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Editor>(null);
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadMatrix = useCallback(async () => {
    try { setMatrix(await api<RoleMatrix>('auth/roles/')); }
    catch (reason) { setError((reason as Error).message); }
  }, []);
  const loadActivity = useCallback(async () => {
    const params = new URLSearchParams();
    if (auditAction) params.set('action', auditAction);
    if (auditDateFrom) params.set('date_from', auditDateFrom);
    if (auditDateTo) params.set('date_to', auditDateTo);
    try {
      const result = await api<{ results: AuditRecord[] }>('auth/audit/' + (params.size ? `?${params}` : ''));
      setEvents(result.results);
    } catch (reason) { setError((reason as Error).message); }
  }, [auditAction, auditDateFrom, auditDateTo]);
  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set('search', query);
    if (roleFilter) params.set('role', roleFilter);
    if (activeFilter) params.set('active', activeFilter);
    if (staffDateFrom || staffDateTo) params.set('date_field', staffDateField);
    if (staffDateFrom) params.set('date_from', staffDateFrom);
    if (staffDateTo) params.set('date_to', staffDateTo);
    try { setStaff(await api<StaffList>(`auth/staff/?${params}`)); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [page, query, roleFilter, activeFilter, staffDateField, staffDateFrom, staffDateTo]);

  useEffect(() => { void loadMatrix(); void loadActivity(); }, [loadMatrix, loadActivity]);
  useEffect(() => { void loadStaff(); }, [loadStaff]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!editor) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) setEditor(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [editor, saving]);

  function openCreate() {
    setSelected(null); setForm(emptyForm()); setFormError(''); setEditor('create');
  }
  function openEdit(user: StaffRecord) {
    setSelected(user); setForm({ username: user.username, first_name: user.first_name, last_name: user.last_name,
      email: user.email, role: user.role || 'viewer', is_active: user.is_active, password: '' });
    setFormError(''); setEditor('edit');
  }
  function openReset(user: StaffRecord) {
    setSelected(user); setForm({ username: user.username, first_name: '', last_name: '',
      email: '', role: user.role || 'viewer', is_active: user.is_active, password: '' });
    setFormError(''); setEditor('reset');
  }
  function change<K extends keyof StaffForm>(field: K, value: StaffForm[K]) { setForm((current) => ({ ...current, [field]: value })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setFormError(''); setSuccess('');
    try {
      if (editor === 'create') {
        await api('auth/staff/', { method: 'POST', body: JSON.stringify(form) });
        setSuccess(`Account ${form.username} created. A password change will be required at first sign-in.`);
      } else if (editor === 'edit' && selected) {
        await api(`auth/staff/${selected.id}/`, { method: 'PATCH', body: JSON.stringify({
          first_name: form.first_name, last_name: form.last_name, email: form.email,
          role: form.role, is_active: form.is_active,
        }) });
        setSuccess(`${selected.username} updated. Role or status changes will require a new sign-in.`);
      } else if (editor === 'reset' && selected) {
        await api(`auth/staff/${selected.id}/reset-password/`, {
          method: 'POST', body: JSON.stringify({ password: form.password }),
        });
        setSuccess(`Password reset for ${selected.username}. The current session is revoked.`);
      }
      setEditor(null); setForm(emptyForm()); setPage(1);
      await Promise.all([loadActivity(), loadStaff()]);
    } catch (reason) { setFormError((reason as Error).message); }
    finally { setSaving(false); }
  }

  const userCount = staff?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(userCount / (staff?.page_size ?? 15)));

  return (
    <div className="access-workspace">
      <div className="access-intro">
        <div className="access-intro-icon"><ShieldCheck size={25} /></div>
        <div><h2>Staff access and permissions</h2><p>Manage reporting accounts and review permission assignments.</p></div>
        <button className="btn btn-primary access-add" type="button" onClick={openCreate}><Plus size={17} /> Add staff account</button>
      </div>
      <div className="access-tabs" role="tablist" aria-label="Staff administration">
        <button type="button" role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}><Users size={17} /> Staff accounts</button>
        <button type="button" role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}><LockKeyhole size={17} /> Role permissions</button>
        <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => { setTab('activity'); void loadActivity(); }}><Activity size={17} /> Access activity</button>
      </div>
      {success && <div className="access-flash success" role="status"><Check size={18} /> {success}<button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message"><X size={16} /></button></div>}
      {error && <div className="access-flash error-state" role="alert">{error}<button type="button" onClick={() => { setError(''); void loadStaff(); void loadMatrix(); void loadActivity(); }}>Retry</button></div>}

      {tab === 'accounts' && (
        <section className="panel access-panel" aria-label="Staff account list">
          <div className="access-panel-head">
            <div><h3>Staff directory</h3><p>{loading ? 'Loading accounts...' : `${userCount} account${userCount === 1 ? '' : 's'} matching current filters`}</p></div>
            <button className="access-icon-button" title="Reload account list" aria-label="Reload account list" type="button" onClick={() => void loadStaff()}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          </div>
          <div className="access-filters">
            <label className="access-search"><Search size={18} /><input aria-label="Search staff by name or email" placeholder="Search staff accounts" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>
              <option value="">All roles</option>{roleNames.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
            </select>
            <select aria-label="Filter by status" value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }}>
              <option value="">All statuses</option><option value="true">Active</option><option value="false">Disabled</option>
            </select>
            <select aria-label="Staff date type" value={staffDateField} onChange={(event) => { setStaffDateField(event.target.value as 'date_joined' | 'last_login'); setPage(1); }}>
              <option value="date_joined">Date joined</option><option value="last_login">Last sign-in</option>
            </select>
            <label className="staff-date-label">From<input aria-label="Staff from date" type="date" value={staffDateFrom} onChange={(event) => { setStaffDateFrom(event.target.value); setPage(1); }} /></label>
            <label className="staff-date-label">To<input aria-label="Staff to date" type="date" value={staffDateTo} min={staffDateFrom} onChange={(event) => { setStaffDateTo(event.target.value); setPage(1); }} /></label>
          </div>
          <div className="access-table-scroll" role="region" tabIndex={0} aria-label="Staff accounts table">
            <table className="access-table">
              <thead><tr><th scope="col">Staff member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {(staff?.results ?? []).map((user) => {
                  const protectedUser = user.is_superuser || user.id === account.id;
                  return <tr key={user.id}>
                    <td><div className="access-person"><span className="access-person-avatar"><CircleUserRound size={19} /></span><span><strong>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</strong><small>{user.username} {user.email ? `· ${user.email}` : ''}</small></span></div></td>
                    <td><span className={`access-role role-${user.role ?? 'unknown'}`}>{user.role || 'Unassigned'}</span></td>
                    <td><span className={`access-status ${user.is_active ? 'enabled' : 'disabled'}`}>{user.is_active ? 'Active' : 'Disabled'}</span>{user.must_change_password && <small className="access-pending">Password change required</small>}</td>
                    <td>{readableDate(user.last_login)}</td>
                    <td><div className="access-actions">
                      {protectedUser ? <span className="access-protected"><ShieldCheck size={14} /> Protected</span> : <>
                        <button type="button" className="access-action" onClick={() => openEdit(user)}><Pencil size={15} /> Edit</button>
                        <button type="button" className="access-action" onClick={() => openReset(user)}><KeyRound size={15} /> Reset</button>
                      </>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {!loading && staff && staff.results.length === 0 && <div className="access-empty">No staff accounts match these filters.</div>}
            {loading && !staff && <div className="access-empty">Loading staff accounts...</div>}
          </div>
          <div className="access-pagination"><span>Page {page} of {totalPages}</span><div>
            <button className="access-icon-button" aria-label="Previous page" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={19} /></button>
            <button className="access-icon-button" aria-label="Next page" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={19} /></button>
          </div></div>
        </section>
      )}

      {tab === 'roles' && (
        <section className="access-matrix" aria-label="Permission matrix">
          {matrix?.roles.map((role) => <article className="access-role-card panel" key={role.name}>
            <div className="access-role-head"><span className={`access-role role-${role.name}`}>{role.name}</span><ShieldCheck size={21} /></div>
            <h3>{role.name[0].toUpperCase() + role.name.slice(1)}</h3><p>{role.description}</p>
            <div className="access-permissions-list">{matrix.capabilities.map((capability) => {
              const granted = role.permissions.includes(capability.key);
              return <div className={granted ? 'granted' : 'not-granted'} key={capability.key}>
                <span className="access-capability-check">{granted ? <Check size={15} /> : <X size={14} />}</span><span>{capability.label}</span>
              </div>;
            })}</div>
          </article>)}
          {!matrix && <p className="access-empty">Permission definitions could not be loaded.</p>}
          <p className="access-permission-note">Permission definitions are enforced by Django on every API request. Changes to the role policy require an approved backend update.</p>
        </section>
      )}

      {tab === 'activity' && (
        <section className="panel access-panel" aria-label="Staff access audit log">
          <div className="access-panel-head"><div><h3>Recent account activity</h3><p>Recent access changes. Password values are never recorded.</p></div><button className="access-icon-button" onClick={() => void loadActivity()} type="button" aria-label="Reload audit log"><RefreshCw size={18} /></button></div>
          <div className="access-filters staff-audit-filters">
            <select aria-label="Activity type" value={auditAction} onChange={(event) => setAuditAction(event.target.value)}>
              <option value="">All activities</option>
              <option value="staff.created">Staff created</option><option value="staff.updated">Staff updated</option>
              <option value="staff.password_reset">Password reset</option><option value="password.changed">Password changed</option>
              <option value="metrics.records_exported">Records exported</option>
            </select>
            <label className="staff-date-label">From<input aria-label="Activity from date" type="date" value={auditDateFrom} onChange={(event) => setAuditDateFrom(event.target.value)} /></label>
            <label className="staff-date-label">To<input aria-label="Activity to date" type="date" value={auditDateTo} min={auditDateFrom} onChange={(event) => setAuditDateTo(event.target.value)} /></label>
          </div>
          <div className="access-audit-list">
            {events.map((item) => <div className="access-audit-row" key={item.id}>
              <span className="access-audit-icon"><Activity size={17} /></span>
              <div><strong>{prettyAction(item.action)}</strong><p><b>{item.actor}</b> · {item.target}</p></div>
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('en-GB')}</time>
            </div>)}
            {!events.length && <div className="access-empty">No recent account activity.</div>}
          </div>
        </section>
      )}

      {editor && <div className="access-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null); }}>
        <section className="access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-dialog-title">
          <div className="access-dialog-head"><div><h2 id="access-dialog-title">{editor === 'create' ? 'Create staff account' : editor === 'reset' ? 'Reset staff password' : 'Edit staff account'}</h2><p>{editor === 'reset' ? `Set a temporary password for ${selected?.username}.` : 'Account access is enforced on the server.'}</p></div><button type="button" className="access-icon-button" aria-label="Close dialog" disabled={saving} onClick={() => setEditor(null)}><X size={21} /></button></div>
          <form onSubmit={(event) => void save(event)} className="access-form">
            {editor !== 'reset' && <>
              <div className="access-field-grid">
                <label>Username<input required disabled={editor === 'edit' || saving} value={form.username} onChange={(event) => change('username', event.target.value)} autoComplete="off" /></label>
                <label>Email<input type="email" value={form.email} onChange={(event) => change('email', event.target.value)} disabled={saving} autoComplete="off" /></label>
                <label>First name<input value={form.first_name} onChange={(event) => change('first_name', event.target.value)} disabled={saving} /></label>
                <label>Last name<input value={form.last_name} onChange={(event) => change('last_name', event.target.value)} disabled={saving} /></label>
                <label>Role<select value={form.role} disabled={saving} onChange={(event) => change('role', event.target.value as Role)}>{roleNames.map((role) => <option value={role} key={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
                <label>Account status<select value={form.is_active ? 'active' : 'disabled'} disabled={saving} onChange={(event) => change('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
              </div>
            </>}
            {(editor === 'create' || editor === 'reset') && <label>Temporary password<input type="password" required minLength={12} autoComplete="new-password" value={form.password} disabled={saving} onChange={(event) => change('password', event.target.value)} /><small>Use 12 or more characters. The staff member must change this password after signing in.</small></label>}
            {editor === 'edit' && <p className="access-form-hint"><ShieldCheck size={16} /> Changing a role or disabling an account immediately revokes its current login token.</p>}
            {formError && <div className="error" role="alert">{formError}</div>}
            <div className="access-form-actions"><button type="button" className="btn btn-outline" disabled={saving} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editor === 'create' ? 'Create account' : editor === 'reset' ? 'Reset password' : 'Save changes'}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}
