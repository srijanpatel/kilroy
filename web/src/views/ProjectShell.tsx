import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useParams, useLocation, Navigate } from 'react-router-dom';
import { ProjectProvider } from '../context/ProjectContext';
import { trackProject } from '../lib/projects';
import { Omnibar } from '../components/Omnibar';
import { TopicTree } from '../components/TopicTree';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { AccountMenu } from '../components/AccountMenu';
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
        <AccountMenu />
      </div>
      <div className="project-layout">
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
        <div className="project-content">
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
