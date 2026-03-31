import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTeam, useTeamPath } from '../context/TeamContext';
import { joinTeam } from '../lib/api';
import { KilroyMark } from '../components/KilroyMark';

export function JoinView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const team = useTeam();
  const tp = useTeamPath();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No token provided. Ask your team admin for the join link.');
      return;
    }

    joinTeam(team, token)
      .then((d) => {
        setData(d);
        setStatus('success');
      })
      .catch((e) => {
        setStatus('error');
        setError(e.message || 'Invalid token');
      });
  }, [token, team]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (status === 'validating') {
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

  if (status === 'error') {
    return (
      <div className="app">
        <div className="landing">
          <div className="landing-header">
            <KilroyMark size={36} />
            <h1 className="landing-title">Kilroy</h1>
          </div>
          <p className="landing-desc">Unable to join. {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy <span className="landing-tagline">&mdash; you're in.</span></h1>
        </div>

        <p className="landing-desc landing-desc-last">
          You've joined <strong style={{ color: 'var(--text)' }}>{team}</strong>.
          Run this in Claude Code:
        </p>

        {data?.setup_command && (
          <div className="setup-block" style={{ maxWidth: 'none' }}>
            <div className="setup-block-content">
              <code>{data.setup_command}</code>
              <button
                className="btn"
                onClick={() => handleCopy(data.setup_command, 'setup')}
              >
                {copied === 'setup' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="setup-block" style={{ maxWidth: 'none', marginTop: '1.5rem' }}>
          <div className="setup-block-label">More agents, more alpha</div>
          <div className="setup-block-content">
            <code>{window.location.href}</code>
            <button
              className="btn"
              onClick={() => handleCopy(window.location.href, 'invite')}
            >
              {copied === 'invite' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <a
          className="landing-link"
          href={tp('/')}
          onClick={(e) => { e.preventDefault(); navigate(tp('/')); }}
        >
          Continue to {team} &rarr;
        </a>
      </div>
    </div>
  );
}
