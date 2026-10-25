import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Brand from '../components/Brand';
import { api, readAccount, setToken, type Account } from '../lib/api';

export default function Login({ onLogin }: { onLogin: (user: Account) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const result = await api<{ token: string; user: unknown }>('auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const verifiedAccount = readAccount(result.user);
      if (typeof result.token !== 'string' || !result.token) throw new Error('The sign-in service did not provide an access token.');
      setToken(result.token);
      onLogin(verifiedAccount);
      navigate('/dashboard', { replace: true });
    } catch (reason) {
      setError((reason as Error).message || 'Sign-in was unsuccessful. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-left" aria-label="My Period Kit reporting portal">
        <Link className="brand-link" to="/" aria-label="Return to My Period Kit Insights home">
          <Brand />
        </Link>
        <div className="auth-message">
          <div className="auth-orb" aria-hidden="true">&#9829;</div>
          <h1>Better information.<br />Better support.</h1>
        </div>
        <span>My Period Kit / Monitoring &amp; reporting</span>
      </section>

      <section className="auth-right" aria-label="Staff sign-in">
        <div className="auth-toprow">
          <Link to="/" className="back"><ArrowLeft size={16} /> Back to home</Link>
          <Link to="/" className="auth-mobile-brand" aria-label="My Period Kit Insights home"><Brand /></Link>
        </div>
        <div className="login-box">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Enter your reporting portal credentials to continue.</p>

          <form onSubmit={submit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              disabled={busy}
            />

            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                disabled={busy}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                disabled={busy}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in securely'}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>

        </div>
        <p className="auth-mobile-footer">My Period Kit / Secure staff access</p>
      </section>
    </main>
  );
}
