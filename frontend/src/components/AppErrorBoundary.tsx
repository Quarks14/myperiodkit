import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Brand from './Brand';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** A rendering error must not silently leave the portal blank. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostic detail goes to the browser console, never into the page or logs containing credentials.
    console.error('My Period Kit interface error:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="portal-recovery" id="main-content">
        <div className="portal-recovery-brand"><Brand /></div>
        <section className="portal-recovery-card" role="alert">
          <span className="portal-recovery-icon"><AlertTriangle size={28} aria-hidden="true" /></span>
          <span className="eyebrow">PAGE ERROR</span>
          <h1>We couldn't display this page</h1>
          <p>An unexpected interface error occurred. Your account and data have not been changed.</p>
          <div className="portal-recovery-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={17} /> Reload page
            </button>
            <a href="/" className="btn btn-outline">Return to home</a>
          </div>
        </section>
      </main>
    );
  }
}
