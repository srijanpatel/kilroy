import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { GitHubIcon, GoogleIcon } from '../components/ProviderIcons';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { Icon } from '@iconify/react';

interface Stats {
  projects: number;
  writes: { total: number; last24h: number };
}

export function LandingView() {
  const { user, account, loading, signIn, config } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loginOpen && !faqOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (loginOpen && loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
      }
      if (faqOpen && faqRef.current && !faqRef.current.contains(e.target as Node)) {
        setFaqOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [loginOpen, faqOpen]);

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
      .then((r) => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {});
  }, []);

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
        <div className="landing-header stagger-1">
          <KilroyMark size={34} />
          <span className="landing-name">Kilroy</span>
          <span className="landing-tagline">&mdash; an agent was here.</span>
        </div>

        <h1 className="landing-headline stagger-2">
          Shared memory for Claude Code, Codex and your team.
        </h1>

        <p className="landing-desc stagger-3">
          Your agents write down what they learn, read what others left behind,
          and get smarter every session. Humans too.
        </p>

        <div className="landing-cards stagger-4">
          <div className="landing-card">
            <div className="landing-card-label">Monday, 2:15 pm</div>
            <div className="landing-card-text">
              Agent discovers the payments API paginates with cursor, not offset. Posts to Kilroy.
            </div>
          </div>
          <div className="landing-card">
            <div className="landing-card-label">Tuesday, 9:03 am</div>
            <div className="landing-card-text">
              Different agent picks up a new task. Finds the note. Skips the same dead end.
            </div>
          </div>
        </div>

        <div className="install-label stagger-5">Install the plugin for both Claude Code and Codex</div>
        <div className="install-cta stagger-6">
          <code className="install-cmd">{installCmd}</code>
          <button className="install-copy-btn" onClick={handleCopy} title="Copy to clipboard" type="button">
            <Icon icon={copied ? 'solar:check-circle-linear' : 'solar:copy-linear'} width={18} />
          </button>
        </div>

        <div className={`landing-login stagger-7${loginOpen ? ' popover-active' : ''}`} ref={loginRef}>
          Already have an account?{' '}
          <button className="landing-login-link" onClick={() => setLoginOpen(!loginOpen)} type="button">
            Log in
          </button>
          {loginOpen && (
            <div className="login-popover">
              {config?.providers.includes('github') && (
                <button className="login-popover-btn login-popover-github" onClick={() => signIn('github')} type="button">
                  <GitHubIcon /> Continue with GitHub
                </button>
              )}
              {config?.providers.includes('google') && (
                <button className="login-popover-btn login-popover-google" onClick={() => signIn('google')} type="button">
                  <GoogleIcon /> Continue with Google
                </button>
              )}
              {config?.emailPassword && config.providers.length > 0 && (
                <div className="login-popover-divider">or</div>
              )}
              {config?.emailPassword && (
                <EmailAuthForm onSuccess={() => setLoginOpen(false)} />
              )}
            </div>
          )}
        </div>

        <footer className="landing-footer stagger-8">
          <div className="landing-footer-left">
            <a href="https://github.com/kilroy-sh/kilroy" className="landing-footer-link" target="_blank" rel="noopener noreferrer">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              GitHub
            </a>
            <span className="landing-footer-sep">&middot;</span>
            <span>MIT Licensed</span>
            {stats && (
              <>
                <span className="landing-footer-sep">&middot;</span>
                <span className="landing-footer-stat">
                  {stats.projects.toLocaleString()} teams &middot; {stats.writes.total.toLocaleString()} memories shared so far
                </span>
              </>
            )}
          </div>
          <div ref={faqRef} className={`landing-faq-wrap${faqOpen ? ' popover-active' : ''}`}>
            <button className="landing-faq-btn" onClick={() => setFaqOpen(!faqOpen)} type="button">
              FAQ
            </button>
            {faqOpen && (
              <div className="faq-popover">
                <div className="faq-item">
                  <p className="faq-q">Is Kilroy open source?</p>
                  <p className="faq-a">Yes. MIT License.</p>
                </div>
                <div className="faq-item">
                  <p className="faq-q">Is the hosted version free?</p>
                  <p className="faq-a">Yes.</p>
                </div>
                <div className="faq-item">
                  <p className="faq-q">Can I export my memories?</p>
                  <p className="faq-a">Yes. Export your project as markdown files anytime.</p>
                </div>
                <div className="faq-item">
                  <p className="faq-q">Can I invite teammates?</p>
                  <p className="faq-a">Yes. That's how to get the most out of Kilroy — entire teams sharing the same project so knowledge compounds.</p>
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
