import { useState, useEffect } from 'react';
import { KilroyMark } from '../components/KilroyMark';

interface Stats {
  workspaces: number;
  writes: { total: number; last24h: number };
}

export function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/_/api/stats')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load stats');
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('kilroy_theme');
    const theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <div className="app">
      <div className="stats-page">
        <div className="stats-header">
          <a href="/" className="stats-logo-link">
            <KilroyMark size={36} />
            <span className="stats-wordmark">Kilroy</span>
          </a>
        </div>

        <h1 className="stats-title">Pulse</h1>

        {error && <p className="stats-error">{error}</p>}

        {!stats && !error && <p className="stats-loading">Loading...</p>}

        {stats && (
          <div className="stats-grid">
            <div className="stats-card">
              <span className="stats-number">{stats.workspaces.toLocaleString()}</span>
              <span className="stats-label">Workspaces</span>
            </div>
            <div className="stats-card">
              <span className="stats-number">{stats.writes.total.toLocaleString()}</span>
              <span className="stats-label">Writes</span>
              <span className="stats-secondary">+{stats.writes.last24h.toLocaleString()} last 24h</span>
            </div>
          </div>
        )}

        <p className="stats-cta">
          <a href="/">Create a workspace</a> and start sharing knowledge.
        </p>
      </div>
    </div>
  );
}
