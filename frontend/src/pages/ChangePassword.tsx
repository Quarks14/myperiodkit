import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import Brand from '../components/Brand';
import { api, clearToken, readAccount, setToken, type Account } from '../lib/api';

export default function ChangePassword({ account, onChange, onLogout }: {
  account: Account;
  onChange: (account: Account) => void;
  onLogout: () => void;
}) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) { setError('The new passwords do not match.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await api<{ user: unknown; token: string }>('auth/password/', {
        method: 'POST', body: JSON.stringify({ current_password: oldPassword, new_password: newPassword }),
      });
      const verifiedAccount = readAccount(result.user);
      if (typeof result.token !== 'string' || !result.token) throw new Error('The service did not provide an updated access token.');
      setToken(result.token);
      onChange(verifiedAccount);
      navigate('/dashboard', { replace: true });
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function signOut() {
    try { await api('auth/logout/', { method: 'POST' }); } catch { /* Local sign-out still applies. */ }
    clearToken(); onLogout(); navigate('/login', { replace: true });
  }

  return (
    <main className="password-page">
      <div className="password-brand"><Link to="/" aria-label="My Period Kit homepage"><Brand /></Link></div>
      <section className="password-card" aria-label="Account password settings">
        <div className="password-card-icon"><KeyRound size={27} /></div>
        <span className="eyebrow">ACCOUNT SECURITY</span>
        <h1>{account.must_change_password ? 'Set your new password' : 'Change your password'}</h1>
        <p>{account.must_change_password
          ? 'Your account requires a password change before you can access reporting.'
          : 'Update your password to keep your account secure.'}</p>
        <form onSubmit={submit}>
          <label htmlFor="old-password">Current password</label>
          <input id="old-password" type="password" autoComplete="current-password" required value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} />
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          <span className="password-guidance"><ShieldCheck size={15} /> At least 12 characters. Avoid common or previously used passwords.</span>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn btn-primary password-save" type="submit" disabled={saving}><LockKeyhole size={17} />{saving ? 'Saving...' : 'Update password'} <ArrowRight size={16} /></button>
        </form>
        <button className="password-signout" type="button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
      </section>
    </main>
  );
}
