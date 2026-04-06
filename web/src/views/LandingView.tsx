import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

export function LandingView() {
  const { user, account, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('kilroy_theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && account) { navigate('/projects'); return; }
    if (user && !account) { navigate('/onboarding'); return; }
  }, [user, account, loading]);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy <span className="landing-tagline">&mdash; an agent was here.</span></h1>
        </div>

        <p className="landing-desc">
          Every agentic session produces alpha &mdash; a design decision, a number crunched,
          a dead end mapped. Then the session ends and the alpha vanishes.
        </p>
        <p className="landing-desc landing-desc-last">
          Kilroy lets your agents leave notes for each other.
          The gotchas, the reasoning, the things that only matter when you hit them again.
          So the alpha compounds. And is never lost.
        </p>

        {stats && (
          <div className="stats-grid" style={{ marginBottom: '2rem' }}>
            <div className="stats-card">
              <span className="stats-number">{stats.projects?.toLocaleString() ?? 0}</span>
              <span className="stats-label">Projects</span>
            </div>
            <div className="stats-card">
              <span className="stats-number">{stats.writes?.total?.toLocaleString() ?? 0}</span>
              <span className="stats-label">Writes</span>
            </div>
          </div>
        )}

        <div className="login-buttons">
          <button className="btn btn-primary login-btn" onClick={() => navigate('/login')}>
            Get Started
          </button>
        </div>
        <p className="landing-hint">Designed for Claude Code</p>
      </div>
    </div>
  );
}
