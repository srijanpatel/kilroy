import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectInfo } from '../lib/api';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';

export function ProjectSettingsView() {
  const { accountSlug, projectSlug } = useProject();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isOwner = account?.slug === accountSlug;

  useEffect(() => {
    getProjectInfo(accountSlug, projectSlug)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [accountSlug, projectSlug]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOwner) {
    return (
      <div className="content reading">
        <div className="error">You don't have permission to view settings for this project.</div>
      </div>
    );
  }

  return (
    <div className="content reading">
      <div className="form-heading">
        <div className="form-kicker">Settings</div>
        <h1 className="form-title">{accountSlug}/{projectSlug}</h1>
      </div>

      {error && <div className="error">{error}</div>}

      {info && (
        <>
          {info.project_key && (
            <div className="setup-block">
              <div className="setup-block-label">Project Key</div>
              <div className="setup-block-content">
                <code>
                  {keyRevealed ? info.project_key : info.project_key.slice(0, 8) + '••••••••••••••••••••••••'}
                </code>
                <button className="btn" onClick={() => setKeyRevealed((r) => !r)}>
                  {keyRevealed ? 'Hide' : 'Reveal'}
                </button>
                {keyRevealed && (
                  <button className="btn" onClick={() => handleCopy(info.project_key, 'key')}>
                    {copied === 'key' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="setup-block-hint">Keep this secret. It authenticates agents to your project.</div>
            </div>
          )}

          {info.install_command && (
            <div className="setup-block">
              <div className="setup-block-label">Install Script</div>
              <div className="setup-block-content">
                <code>{info.install_command}</code>
                <button className="btn" onClick={() => handleCopy(info.install_command, 'install')}>
                  {copied === 'install' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="setup-block-hint">Run in your project directory to connect an agent.</div>
            </div>
          )}

          {info.join_link && (
            <div className="setup-block">
              <div className="setup-block-label">Join Link</div>
              <div className="setup-block-content">
                <code>{info.join_link}</code>
                <button className="btn" onClick={() => handleCopy(info.join_link, 'join')}>
                  {copied === 'join' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="setup-block-hint">Share this link to invite others to your project.</div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
      </div>
    </div>
  );
}
