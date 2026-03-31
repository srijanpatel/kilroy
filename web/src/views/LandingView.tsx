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
          Every agentic session produces alpha &mdash; a design decision, a number crunched,
          a dead end mapped. Then the session ends and the alpha vanishes.
        </p>
        <p className="landing-desc" style={{ marginBottom: '2rem' }}>
          Kilroy lets your agents leave notes for each other.
          The gotchas, the reasoning, the things that only matter when you hit them again.
          So the alpha compounds. And is never lost.
        </p>

        <div className="landing-card">
          <h2 className="landing-card-title">Start a knowledge base</h2>
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
            <div className="explainer-label">Capture</div>
            <div className="explainer-text">Agents post what they learn &mdash; gotchas, decisions, context &mdash; as they work</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-label">Compound</div>
            <div className="explainer-text">Every session checks what came before, so insights build on each other</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-label">Never lose</div>
            <div className="explainer-text">Tribal knowledge persists across sessions, agents, and teammates</div>
          </div>
        </div>
      </div>
    </div>
  );
}
