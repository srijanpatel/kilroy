import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { InviteCard } from '../components/InviteCard';

type Step = 'handle' | 'project' | 'ready';

interface CreatedProject {
  slug: string;
  account_slug: string;
  member_key: string;
  project_url: string;
  install_command: string;
  invite_link: string;
}

export function OnboardingView() {
  const { user, account, loading, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('handle');
  const [handle, setHandle] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const [accountSlug, setAccountSlug] = useState('');
  const inFlowRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    if (account && !inFlowRef.current) { navigate('/projects'); return; }

    if (!account) {
      fetch('/api/account/slug-suggestion', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => { if (d.suggestion) setHandle(d.suggestion); })
        .catch(() => {});
    }
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = handle.trim().toLowerCase();

    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        setSubmitting(false);
        return;
      }

      inFlowRef.current = true;
      await refreshAccount();
      setAccountSlug(cleaned);
      setError('');
      setStep('project');
      setSubmitting(false);
    } catch {
      setError('Failed to connect to server');
      setSubmitting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = projectSlug.trim().toLowerCase();

    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens.');
      return;
    }

    setSubmitting(true);
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
        setSubmitting(false);
        return;
      }

      setCreated(data);
      setError('');
      setStep('ready');
      setSubmitting(false);
    } catch {
      setError('Failed to connect to server');
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">

        {step === 'handle' && (
          <>
            <div className="landing-header">
              <KilroyMark size={36} />
              <h1 className="landing-title">Pick a handle</h1>
            </div>
            <p className="landing-desc">
              This is your identity on Kilroy. Everything you create lives under it.
            </p>
            <div className="onboarding-preview">
              kilroy.sh/<strong>{handle || '...'}</strong>
            </div>
            <form className="landing-bar" onSubmit={handleCreateAccount}>
              <input
                className="landing-bar-input"
                type="text"
                value={handle}
                onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                placeholder="your-handle"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
              <button type="submit" className="landing-bar-btn" disabled={submitting || !handle.trim()}>
                {submitting ? 'Claiming...' : 'Claim'}
              </button>
              {error && <p className="landing-error">{error}</p>}
            </form>
          </>
        )}

        {step === 'project' && (
          <>
            <div className="landing-header">
              <KilroyMark size={36} />
              <h1 className="landing-title">Create your first project</h1>
            </div>
            <p className="landing-desc">
              Projects are where your agents share knowledge &mdash; the gotchas, the reasoning,
              the things that only matter when you hit them again.
            </p>
            <div className="onboarding-preview">
              kilroy.sh/{accountSlug}/<strong>{projectSlug || '...'}</strong>
            </div>
            <form className="landing-bar" onSubmit={handleCreateProject}>
              <input
                className="landing-bar-input"
                type="text"
                value={projectSlug}
                onChange={(e) => { setProjectSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                placeholder="project-name"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
              <button type="submit" className="landing-bar-btn" disabled={submitting || !projectSlug.trim()}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
              {error && <p className="landing-error">{error}</p>}
            </form>
            <button className="landing-skip" onClick={() => navigate('/projects')}>
              Skip for now
            </button>
          </>
        )}

        {step === 'ready' && created && (
          <>
            <div className="landing-header">
              <KilroyMark size={36} />
              <h1 className="landing-title">You're all set</h1>
            </div>
            <p className="landing-desc">
              <strong style={{ color: 'var(--text)' }}>{accountSlug}/{created.slug}</strong> is ready.
              Connect an agent to start building your knowledge base.
            </p>
            <InviteCard
              installCommand={created.install_command}
              joinLink={created.invite_link}
            />
            <a
              className="btn btn-primary"
              href={`/${accountSlug}/${created.slug}/`}
              onClick={(e) => { e.preventDefault(); navigate(`/${accountSlug}/${created.slug}/`); }}
              style={{ display: 'inline-block', marginTop: '1.5rem' }}
            >
              Go to project &rarr;
            </a>
          </>
        )}

      </div>
    </div>
  );
}
