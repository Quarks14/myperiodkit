import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import SessionRecovery from './components/SessionRecovery';
import { AccountContractError, ApiError, api, clearToken, readAccount, token, type Account } from './lib/api';

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(Boolean(token()));
  const [sessionIssue, setSessionIssue] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Tokens survive a page refresh. Account data must always be revalidated by
    // the server before any protected page is displayed.
    if (!token()) {
      setChecking(false);
      return;
    }
    let active = true;
    setChecking(true);
    api<unknown>('auth/me/')
      .then((response) => {
        if (!active) return;
        setAccount(readAccount(response));
        setSessionIssue('');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setAccount(null);
        if (reason instanceof AccountContractError) {
          setSessionIssue(reason.message);
        } else if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
          // An invalid or revoked token is never allowed to keep the user signed in.
          clearToken();
          setSessionIssue('');
        } else {
          setSessionIssue('The reporting service could not verify your account. Check that Django is running and the database migrations have been applied, then try again.');
        }
      })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [attempt]);

  const signOutLocally = () => {
    clearToken();
    setAccount(null);
    setSessionIssue('');
    setChecking(false);
  };

  if (checking) return <div className="loading full" role="status">Loading your workspace…</div>;
  if (sessionIssue) {
    return <SessionRecovery
      message={sessionIssue}
      onRetry={() => setAttempt((previous) => previous + 1)}
      onSignOut={signOutLocally}
    />;
  }

  const ready = Boolean(account && !account.must_change_password);
  const next = account?.must_change_password ? '/change-password' : '/dashboard';

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={account ? <Navigate to={next} replace /> : <Login onLogin={setAccount} />} />
      <Route path="/dashboard" element={ready && account ? <Dashboard account={account} onLogout={signOutLocally} /> : <Navigate to={account ? '/change-password' : '/login'} replace />} />
      <Route path="/change-password" element={account ? <ChangePassword account={account} onChange={setAccount} onLogout={signOutLocally} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
