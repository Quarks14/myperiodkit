import { ArrowRight, RefreshCw, ShieldAlert } from 'lucide-react';
import Brand from './Brand';

export default function SessionRecovery({ message, onRetry, onSignOut }: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="portal-recovery" id="main-content">
      <div className="portal-recovery-brand"><Brand /></div>
      <section className="portal-recovery-card" role="alert">
        <span className="portal-recovery-icon"><ShieldAlert size={28} aria-hidden="true" /></span>
        <span className="eyebrow">WORKSPACE CONNECTION</span>
        <h1>We couldn't open your workspace</h1>
        <p>{message}</p>
        <div className="portal-recovery-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            <RefreshCw size={17} /> Try again
          </button>
          <button type="button" className="btn btn-outline" onClick={onSignOut}>
            Sign out <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
