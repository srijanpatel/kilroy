import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useParams, useLocation, Navigate, Link } from 'react-router-dom';
import { ProjectProvider, useProjectPath } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { trackProject } from '../lib/projects';
import { Omnibar } from '../components/Omnibar';
import { TopicTree } from '../components/TopicTree';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { BrowseView } from './BrowseView';
import { PostView } from './PostView';
import { SearchView } from './SearchView';
import { PostEditorView } from './NewPostView';
import { JoinView } from './JoinView';
import { ProjectSettingsView } from './ProjectSettingsView';

function useSidebarState(key: string) {
  const storageKey = `kilroy:sidebar:${key}`;
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === 'true';
  });

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      localStorage.setItem(storageKey, String(!prev));
      return !prev;
    });
  }, [storageKey]);

  return { expanded, toggle };
}

export function ProjectShell() {
  const { account, project } = useParams();
  const [currentTopic, setCurrentTopic] = useState('');

  useEffect(() => {
    if (account && project) trackProject(account, project);
  }, [account, project]);

  if (!account || !project) return null;

  return (
    <ProjectProvider accountSlug={account} projectSlug={project}>
      <Routes>
        <Route path="join" element={<JoinView />} />
        <Route path="*" element={
          <ProjectLayout
            key={`${account}/${project}`}
            account={account}
            project={project}
            currentTopic={currentTopic}
            onTopicChange={setCurrentTopic}
          />
        } />
      </Routes>
    </ProjectProvider>
  );
}

function AccountMenu(_props: { account: string; project: string }) {
  const { user, account: kilroyAccount, signOut } = useAuth();
  const pp = useProjectPath();
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

  return (
    <div className="account-menu-wrapper" ref={menuRef}>
      <button
        className="account-menu-btn"
        onClick={() => setOpen((o) => !o)}
        title={displayName}
      >
        {displayName}
      </button>
      {open && (
        <div className="account-menu-popover">
          <Link
            className="account-menu-item"
            to="/projects"
            onClick={() => setOpen(false)}
          >
            My Projects
          </Link>
          <Link
            className="account-menu-item"
            to={pp('/settings')}
            onClick={() => setOpen(false)}
          >
            Project Settings
          </Link>
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

function ProjectLayout({ account, project, currentTopic, onTopicChange }: {
  account: string;
  project: string;
  currentTopic: string;
  onTopicChange: (t: string) => void;
}) {
  const { expanded, toggle } = useSidebarState(`${account}/${project}`);
  const location = useLocation();

  // Keyboard shortcut: Cmd+\ or Ctrl+\ to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const postMatch = location.pathname.match(/\/post\/([^/]+)/);
  const activePostId = postMatch ? postMatch[1] : null;

  return (
    <div className="app">
      <AuthorPrompt />
      <div className="omnibar-row">
        <button
          className={`sidebar-toggle-btn${expanded ? ' sidebar-open' : ''}`}
          onClick={toggle}
          title={expanded ? 'Collapse sidebar (⌘\\)' : 'Expand sidebar (⌘\\)'}
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="2" width="16" height="14" rx="2" />
            <line x1="6.5" y1="2" x2="6.5" y2="16" />
            <line x1="3" y1="7" x2="5" y2="7" />
            <line x1="3" y1="10" x2="5" y2="10" />
          </svg>
        </button>
        <Omnibar currentTopic={currentTopic} />
        <AccountMenu account={account} project={project} />
      </div>
      <div className="workspace-layout">
        {expanded && (
          <div className="sidebar-region">
            <div className="sidebar-backdrop" onClick={toggle} />
            <aside className="sidebar">
              <div className="sidebar-header">
                <span className="sidebar-title">{account}/{project}</span>
                <button className="sidebar-toggle" onClick={toggle} title="Collapse sidebar (⌘\)">«</button>
              </div>
              <div className="sidebar-tree">
                <TopicTree activePostId={activePostId} />
              </div>
            </aside>
          </div>
        )}
        <div className="workspace-content">
          <Routes>
            <Route path="post/:id/edit" element={<PostEditorView onTopicChange={onTopicChange} />} />
            <Route path="post/:id" element={<PostView onTopicChange={onTopicChange} />} />
            <Route path="post/new" element={<PostEditorView onTopicChange={onTopicChange} />} />
            <Route path="search" element={<SearchView />} />
            <Route path="browse/*" element={<BrowseView onTopicChange={onTopicChange} />} />
            <Route path="settings" element={<ProjectSettingsView />} />
            <Route path="" element={<Navigate to="browse/" replace />} />
            <Route path="*" element={<Navigate to="browse/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
