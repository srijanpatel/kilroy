import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

interface Project {
  id: string;
  slug: string;
  account_slug: string;
}

export function ConsentView() {
  const { user, account, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const scope = params.get('scope') || '';

  useEffect(() => {
    if (loading || !user || !account) return;
    fetch('/api/projects', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const owned = (data.owned || []).map((project: { id: string; slug: string }) => ({
          id: project.id,
          slug: project.slug,
          account_slug: account.slug,
        }));
        const joined = (data.joined || []).map((project: { id: string; slug: string; owner: string }) => ({
          id: project.id,
          slug: project.slug,
          account_slug: project.owner,
        }));
        const accessible = [...owned, ...joined].filter(
          (project: Project, index: number, all: Project[]) =>
            all.findIndex((candidate) => candidate.id === project.id) === index,
        );
        setProjects(accessible);
        if (accessible.length === 1) setSelectedProjectId(accessible[0].id);
      })
      .catch(() => {});
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreateProject = async () => {
    if (!slugPattern.test(newProjectSlug)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: newProjectSlug }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create project');
        return;
      }
      const project = await res.json();
      setProjects(prev => [...prev, { id: project.id, slug: project.slug, account_slug: account!.slug }]);
      setSelectedProjectId(project.id);
      setNewProjectSlug('');
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleConsent = async () => {
    if (!selectedProjectId) {
      setError('Select a project to connect');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const project = projects.find(p => p.id === selectedProjectId);
      if (!project) return;

      const projectScope = `project:${project.id}:${project.account_slug}:${project.slug}`;
      const fullScope = scope ? `${scope} ${projectScope}` : projectScope;

      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accept: true, scope: fullScope }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Consent failed');
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      }
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!user || !account) {
    window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return null;
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={28} />
          <h1 className="consent-title">Connect to Kilroy</h1>
        </div>

        <p className="landing-desc">Select a project to connect your agent to.</p>

        {projects.length > 0 && (
          <div className="consent-projects">
            {projects.map(p => (
              <label key={p.id} className={`consent-project ${selectedProjectId === p.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="project"
                  value={p.id}
                  checked={selectedProjectId === p.id}
                  onChange={() => setSelectedProjectId(p.id)}
                />
                <span className="consent-project-slug">{p.account_slug}/{p.slug}</span>
              </label>
            ))}
          </div>
        )}

        <div className="consent-create">
          <p className="consent-create-label">Or create a new project:</p>
          <div className="consent-create-row">
            <input
              className="landing-bar-input"
              type="text"
              value={newProjectSlug}
              onChange={e => setNewProjectSlug(e.target.value.toLowerCase())}
              placeholder="new-project"
            />
            <button
              className="login-btn login-btn-sm login-btn-github"
              onClick={handleCreateProject}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {error && <p className="landing-error consent-error">{error}</p>}

        <button
          className="login-btn login-btn-github consent-submit"
          onClick={handleConsent}
          disabled={submitting || !selectedProjectId}
        >
          {submitting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
