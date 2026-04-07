import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { InviteCard } from '../components/InviteCard';
import { Navbar } from '../components/Navbar';

interface Project {
  id: string;
  slug: string;
  created_at: string;
}

interface NewProject extends Project {
  project_key: string;
  project_url: string;
  install_url: string;
  account_slug: string;
}

export function ProjectsView() {
  const { user, account, loading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<NewProject | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    if (!account) { navigate('/onboarding'); return; }

    fetch('/api/projects', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = slug.trim().toLowerCase();

    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create project');
        setCreating(false);
        return;
      }

      setCreated(data);
      setProjects((prev) => [{ id: data.id, slug: data.slug, created_at: new Date().toISOString() }, ...prev]);
      setSlug('');
      setCreating(false);
    } catch {
      setError('Failed to connect to server');
      setCreating(false);
    }
  };

  if (loading || !account) return null;

  return (
    <div className="app">
      <Navbar>
        <div className="navbar-brand">
          <KilroyMark size={22} />
          <span className="navbar-brand-name">Kilroy</span>
        </div>
      </Navbar>
      <div className="landing">

        {created && (
          <div className="join-section">
            <div className="join-section-label">Project created: {created.slug}</div>
            <InviteCard
              installCommand={`curl -sL "${created.install_url}" | sh`}
              joinLink={`${created.project_url}/join?token=${created.project_key}`}
            />
          </div>
        )}

        {projects.length > 0 && (
          <div className="landing-projects">
            <div className="landing-projects-label">Your projects</div>
            <div className="landing-projects-list">
              {projects.map((p) => (
                <a
                  key={p.id}
                  href={`/${account.slug}/${p.slug}/`}
                  className="landing-project-card"
                  onClick={(e) => { e.preventDefault(); navigate(`/${account.slug}/${p.slug}/`); }}
                >
                  <KilroyMark size={18} />
                  <span className="landing-project-slug">{p.slug}</span>
                  <span className="landing-project-arrow">&rarr;</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {!loadingProjects && (
          <>
            <div className="landing-projects-label">
              {projects.length > 0 ? 'Create a new project' : 'Create your first project'}
            </div>
            <form className="landing-bar" onSubmit={handleCreate}>
              <input
                className="landing-bar-input"
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                placeholder="project-name"
                autoComplete="off"
                spellCheck={false}
                disabled={creating}
              />
              <button type="submit" className="landing-bar-btn" disabled={creating || !slug.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              {error && <p className="landing-error">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
