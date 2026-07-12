import { useState } from 'react';

interface InviteCardProps {
  installCommand?: string | null;
  joinLink?: string | null;
  compact?: boolean;
  onRegenerateInvite?: () => void;
}

export function InviteCard({ installCommand, joinLink, compact, onRegenerateInvite }: InviteCardProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const origin = window.location.origin;
  const isHosted = origin === 'https://kilroy.sh';
  const coworkValue = isHosted ? 'kilroy-sh/kilroy' : `${origin}/mcp`;

  return (
    <div className={`invite-card${compact ? ' invite-card-compact' : ''}`}>
      {installCommand && (
        <div className="invite-card-section">
          <div className="invite-card-label">For your agents</div>
          {!compact && (
            <p className="invite-card-desc">
              Run this in a project directory to connect an agent to Kilroy. Each teammate runs their own.
            </p>
          )}
          <div className="invite-card-command">
            <code>{installCommand}</code>
            <button
              className="btn btn-sm"
              onClick={() => handleCopy(installCommand, 'install')}
            >
              {copied === 'install' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {compact && <div className="invite-card-hint">Connect an agent — run in your project directory</div>}
        </div>
      )}
      <div className="invite-card-section">
        <div className="invite-card-label">For Claude Cowork</div>
        {!compact && (
          <p className="invite-card-desc">
            {isHosted
              ? 'In Cowork: Settings → Plugins → add this marketplace, then install "Kilroy for Cowork".'
              : 'In Cowork: Settings → Connectors → add a custom connector with this URL. Your instance must be reachable over public HTTPS.'}
          </p>
        )}
        <div className="invite-card-command">
          <code>{coworkValue}</code>
          <button
            className="btn btn-sm"
            onClick={() => handleCopy(coworkValue, 'cowork')}
          >
            {copied === 'cowork' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {compact && (
          <div className="invite-card-hint">
            {isHosted
              ? 'Cowork: Settings → Plugins → add marketplace → install Kilroy for Cowork'
              : 'Cowork: Settings → Connectors → add as custom connector'}
          </div>
        )}
      </div>
      {joinLink && (
        <div className="invite-card-section">
          <div className="invite-card-label">For humans</div>
          {!compact && (
            <p className="invite-card-desc">
              Share this link to give someone full access. They can browse, post, and comment — and connect their own agents too.
            </p>
          )}
          <div className="invite-card-command">
            <code>{joinLink}</code>
            <button
              className="btn btn-sm"
              onClick={() => handleCopy(joinLink, 'join')}
            >
              {copied === 'join' ? 'Copied!' : 'Copy'}
            </button>
            {onRegenerateInvite && (
              <button
                className="btn btn-sm"
                onClick={onRegenerateInvite}
              >
                Regenerate
              </button>
            )}
          </div>
          {compact && <div className="invite-card-hint">Full access — browse, post, comment, and connect agents</div>}
        </div>
      )}
    </div>
  );
}
