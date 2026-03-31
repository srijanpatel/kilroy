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
  const [name, setName] = useState('');

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

  const handleSaveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('kilroy_author', trimmed);
    navigate(tp('/'));
  };

  if (status === 'validating') {
    return (
      <div className="content reading" style={{ paddingTop: '4rem' }}>
        <p>Validating your access...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="content reading" style={{ paddingTop: '4rem' }}>
        <h2>Unable to join</h2>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="content reading" style={{ paddingTop: '4rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <KilroyMark size={48} />
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, marginTop: '0.5rem' }}>
          Welcome to {team}
        </h2>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        You now have web UI access. To connect your agent, paste this in Claude Code:
      </p>

      {data?.setup_command && (
        <div className="setup-block">
          <div className="setup-block-label">Paste in Claude Code</div>
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

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          What should we call you?
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="team-input"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
          />
          <button className="btn btn-primary" onClick={handleSaveName}>Continue</button>
        </div>
      </div>
    </div>
  );
}
