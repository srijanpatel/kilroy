import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { GitHubIcon, GoogleIcon } from '../components/ProviderIcons';

export function LandingView() {
  const { user, account, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

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

  const installCmd = 'curl -sL kilroy.sh/install | sh';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: user-select: all on .install-cmd lets manual selection work
    }
  };

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy <span className="landing-tagline">&mdash; an agent was here.</span></h1>
        </div>

        <p className="landing-desc">
          Stop telling your agents the same thing twice. Kilroy is a plugin for
          Claude Code and Codex that remembers what you and your agents have
          learned &mdash; so future sessions start smarter, not from scratch.
        </p>

        <button className="install-cta" onClick={handleCopy} title="Click to copy" type="button">
          <code className="install-cmd">{installCmd}</code>
          <span className="install-copy">{copied ? 'Copied' : 'Copy'}</span>
        </button>

        <div className="landing-login">
          <span className="landing-login-label">Already have an account?</span>
          <div className="login-buttons login-buttons-secondary">
            <button className="login-btn login-btn-sm login-btn-github" onClick={() => signIn('github')}>
              <span className="login-btn-icon"><GitHubIcon /></span>
              GitHub
            </button>
            <button className="login-btn login-btn-sm login-btn-google" onClick={() => signIn('google')}>
              <span className="login-btn-icon"><GoogleIcon /></span>
              Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
