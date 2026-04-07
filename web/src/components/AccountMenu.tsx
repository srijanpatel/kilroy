import { useState, useEffect, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProjectContext } from '../context/ProjectContext';

export function AccountMenu() {
  const { user, account: kilroyAccount, signOut } = useAuth();
  const projectCtx = useContext(ProjectContext);
  const projectSettingsPath = projectCtx
    ? `/${projectCtx.accountSlug}/${projectCtx.projectSlug}/settings`
    : null;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user) return null;

  const displayName = kilroyAccount?.slug || user.name || user.email;
  const initial = (displayName?.[0] || '?').toUpperCase();

  return (
    <div className="account-menu-wrapper" ref={menuRef}>
      <button
        className="account-menu-btn"
        onClick={() => setOpen((o) => !o)}
        title={displayName}
      >
        <span className="account-menu-avatar">{initial}</span>
      </button>
      {open && (
        <div className="account-menu-popover">
          <div className="account-menu-header">
            <span className="account-menu-avatar account-menu-avatar-lg">{initial}</span>
            <div className="account-menu-identity">
              <div className="account-menu-name">{user.name || kilroyAccount?.slug}</div>
              <div className="account-menu-email">{user.email}</div>
            </div>
          </div>
          <div className="account-menu-divider" />
          <Link
            className="account-menu-item"
            to="/projects"
            onClick={() => setOpen(false)}
          >
            My Projects
          </Link>
          {projectSettingsPath && (
            <Link
              className="account-menu-item"
              to={projectSettingsPath}
              onClick={() => setOpen(false)}
            >
              Project Settings
            </Link>
          )}
          <div className="account-menu-divider" />
          <button
            className="account-menu-item account-menu-item-danger"
            onClick={async () => { setOpen(false); await signOut(); }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
