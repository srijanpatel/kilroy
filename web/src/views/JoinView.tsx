import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { KilroyMark } from '../components/KilroyMark';

type JoinState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'requires_login' }
  | { kind: 'requires_onboarding' }
  | { kind: 'member'; joined: boolean; install_command: string };

export function JoinView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accountSlug, projectSlug } = useProject();
  const token = searchParams.get('token');

  const [state, setState] = useState<JoinState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'No token provided. Ask your project admin for the join link.' });
      return;
    }

    fetch(`/${accountSlug}/${projectSlug}/api/join?token=${encodeURIComponent(token)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Invalid or expired invite link');

        if (d.requires_login) {
          setState({ kind: 'requires_login' });
        } else if (d.requires_onboarding) {
          setState({ kind: 'requires_onboarding' });
        } else if (d.already_member || d.joined) {
          setState({
            kind: 'member',
            joined: !!d.joined,
            install_command: d.install_command,
          });
        } else {
          throw new Error('Unexpected response from server');
        }
      })
      .catch((e) => {
        setState({ kind: 'error', message: e.message || 'Something went wrong' });
      });
  }, [token, accountSlug, projectSlug]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Requires onboarding — redirect
  useEffect(() => {
    if (state.kind === 'requires_onboarding') {
      navigate('/onboarding');
    }
  }, [state, navigate]);

  if (state.kind === 'requires_onboarding') {
    return null;
  }

  // Loading
  if (state.kind === 'loading') {
    return (
      <div className="app">
        <div className="landing">
          <div className="landing-header">
            <KilroyMark size={36} />
            <h1 className="landing-title">Kilroy</h1>
          </div>
          <p className="landing-desc">Validating your access...</p>
        </div>
      </div>
    );
  }

  // Error
  if (state.kind === 'error') {
    return (
      <div className="app">
        <div className="landing">
          <div className="landing-header">
            <KilroyMark size={36} />
            <h1 className="landing-title">Kilroy</h1>
          </div>
          <p className="landing-desc">Unable to join. {state.message}</p>
        </div>
      </div>
    );
  }

  // Requires login
  if (state.kind === 'requires_login') {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return (
      <div className="app">
        <div className="landing">
          <div className="landing-header">
            <KilroyMark size={36} />
            <h1 className="landing-title">Kilroy</h1>
          </div>
          <p className="landing-desc">
            Sign in to join <strong style={{ color: 'var(--text)' }}>{accountSlug}/{projectSlug}</strong>.
          </p>
          <a className="btn" href={`/login?returnTo=${returnTo}`}>Sign in to join</a>
        </div>
      </div>
    );
  }

  // Joined or already a member
  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy</h1>
        </div>

        <div className="join-section">
          <div className="join-section-label">
            {state.joined ? "You've joined!" : "You're already a member"}
          </div>
          <p className="join-section-desc">
            <strong style={{ color: 'var(--text)' }}>{accountSlug}/{projectSlug}</strong>
          </p>

          <div className="setup-block">
            <div className="setup-block-label">Connect your agent</div>
            <div className="setup-block-content">
              <code>{state.install_command}</code>
              <button className="btn" onClick={() => handleCopy(state.install_command)}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="setup-block-hint">Run in your project directory to connect an agent.</div>
          </div>

          <a href={`/${accountSlug}/${projectSlug}/`} className="btn" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Browse project
          </a>
        </div>
      </div>
    </div>
  );
}
