import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export function JoinView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [teamData, setTeamData] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');

  // Extract team slug from URL path
  const teamSlug = window.location.pathname.split('/').filter(Boolean)[0] || '';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No token provided. Ask your team champion for the join link.');
      return;
    }

    // The join endpoint sets the cookie and returns setup info
    fetch(`/${teamSlug}/join?token=${encodeURIComponent(token)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus('error');
          setError(data.error || 'Invalid token');
          return;
        }
        setTeamData(data);
        setStatus('success');
      })
      .catch(() => {
        setStatus('error');
        setError('Failed to connect to server');
      });
  }, [token, teamSlug]);

  const configSnippet = teamData
    ? JSON.stringify(teamData.setup.config, null, 2)
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('kilroy_author', trimmed);
    navigate('/');
  };

  if (status === 'validating') {
    return (
      <div className="join-view" style={{ maxWidth: 520, margin: '80px auto', padding: '0 20px' }}>
        <p>Validating your access...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="join-view" style={{ maxWidth: 520, margin: '80px auto', padding: '0 20px' }}>
        <h2>Unable to join</h2>
        <p style={{ color: 'var(--color-error, #c00)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="join-view" style={{ maxWidth: 520, margin: '80px auto', padding: '0 20px' }}>
      <h2>Welcome to {teamSlug}</h2>
      <p>You now have web UI access. To set up your agent, add this to your project:</p>

      <div style={{ position: 'relative' }}>
        <pre style={{
          background: 'var(--color-surface, #f5f5f5)',
          padding: 16,
          borderRadius: 8,
          fontSize: 13,
          overflow: 'auto',
        }}>
          <code>{`// .claude/settings.local.json (gitignored)\n${configSnippet}`}</code>
        </pre>
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 8px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          What should we call you?
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border, #ddd)' }}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
          />
          <button onClick={handleSaveName} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
