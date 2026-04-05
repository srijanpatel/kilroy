import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KilroyMark } from '../components/KilroyMark';
import { getKnownWorkspaces } from '../lib/workspaces';

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
  const [knownWorkspaces] = useState(getKnownWorkspaces);

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
      const res = await fetch('/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create workspace');
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

        {knownWorkspaces.length > 0 && (
          <div className="landing-workspaces">
            <div className="landing-workspaces-label">Your workspaces</div>
            <div className="landing-workspaces-list">
              {knownWorkspaces.map((t) => (
                <Link key={t} to={`/${t}/`} className="landing-workspace-card">
                  <KilroyMark size={18} />
                  <span className="landing-workspace-slug">{t}</span>
                  <span className="landing-workspace-arrow">&rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="landing-workspaces-label">{knownWorkspaces.length > 0 ? 'Create a new workspace' : ''}</div>
        <form className="landing-bar" onSubmit={handleCreate}>
          <input
            className="landing-bar-input"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
            placeholder="your-workspace-name"
            autoComplete="off"
            spellCheck={false}
            disabled={creating}
          />
          <button type="submit" className="landing-bar-btn" disabled={creating || !slug.trim()}>
            {creating ? 'Creating...' : 'Start'}
          </button>
          {error && <p className="landing-error">{error}</p>}
        </form>
        <p className="landing-hint">Designed for Claude Code</p>
      </div>
    </div>
  );
}
