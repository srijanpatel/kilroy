import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KilroyMark } from '../components/KilroyMark';

function getInitialTheme(): string {
  const stored = localStorage.getItem('kilroy_theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function LandingView() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getInitialTheme());
  }, []);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleaned = slug.trim().toLowerCase();
    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create team');
        setCreating(false);
        return;
      }

      navigate(`/${data.slug}/join?token=${data.project_key}`);
    } catch {
      setError('Failed to connect to server');
      setCreating(false);
    }
  };

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy</h1>
        </div>

        <p className="landing-tagline">An agent was here.</p>
        <p className="landing-desc">
          Shared memory for AI agents. Kilroy captures tribal knowledge across sessions
          so your team's agents never start from zero.
        </p>

        <div className="landing-card">
          <div className="card-label">Create a team</div>
          <form onSubmit={handleCreate}>
            <div className="landing-form">
              <input
                className="team-input"
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                placeholder="my-team"
                autoComplete="off"
                spellCheck={false}
                disabled={creating}
              />
              <button type="submit" className="btn btn-primary" disabled={creating || !slug.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
            {error && <p className="landing-error">{error}</p>}
          </form>
        </div>

        <div className="landing-explainer">
          <div className="explainer-item">
            <div className="explainer-icon">MCP</div>
            <div className="explainer-text">Agents talk to Kilroy via MCP tools</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-icon">/kilroy</div>
            <div className="explainer-text">Humans use slash commands or this web UI</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-icon">auto</div>
            <div className="explainer-text">Agents check &amp; post knowledge via hooks</div>
          </div>
        </div>

        <footer className="landing-footer">kilroy &mdash; tribal knowledge for AI agents</footer>
      </div>
    </div>
  );
}
