import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import Brand from '../components/Brand';

export default function Landing() {
  return (
    <div className="landing">
      <header className="site-head container">
        <Link to="/" aria-label="My Period Kit Insights, home" className="brand-link">
          <Brand />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a
            className="site-website"
            href="https://myperiodkit.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Project website <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <Link className="btn btn-outline btn-nav" to="/login">
            Staff sign in <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="main-content" className="landing-main">
        <div className="hero container">
          <div className="hero-copy">
            <span className="eyebrow">MY PERIOD KIT / PROGRAMME INSIGHTS</span>
            <h1>
              Clearer insights.
              <span>Stronger impact.</span>
            </h1>
            <p>
              A secure reporting workspace for understanding registration,
              onboarding, engagement and programme reach in one place.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-large" to="/login">
                Access the dashboard <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="hero-art" aria-label="My Period Kit reporting illustration">
            <div className="halo halo-outer" aria-hidden="true" />
            <div className="halo halo-inner" aria-hidden="true" />
            <div className="hero-card">
              <div className="hero-pill">
                <Sparkles size={14} aria-hidden="true" /> PURPOSEFUL REPORTING
              </div>
              <div className="illustration" aria-hidden="true">
                <span className="blossom b1" />
                <span className="blossom b2" />
                <span className="blossom b3" />
                <span className="blossom b4" />
                <span className="blossom b5" />
                <span className="blossom-center">&#9829;</span>
              </div>
              <h2>Every number represents a person.</h2>
              <p>Thoughtful reporting to guide meaningful programme action.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="landing-footer container">
        <span>My Period Kit / Programme insights</span>
        <span>Private reporting environment</span>
      </footer>
    </div>
  );
}
