import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useParams, useLocation } from 'react-router-dom';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { trackWorkspace } from '../lib/workspaces';
import { Omnibar } from '../components/Omnibar';
import { TopicTree } from '../components/TopicTree';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { BrowseView } from './BrowseView';
import { PostView } from './PostView';
import { SearchView } from './SearchView';
import { PostEditorView } from './NewPostView';
import { JoinView } from './JoinView';

function useSidebarState(workspace: string) {
  const key = `kilroy:sidebar:${workspace}`;
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? true : stored === 'true';
  });

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      localStorage.setItem(key, String(!prev));
      return !prev;
    });
  }, [key]);

  return { expanded, toggle };
}

export function WorkspaceShell() {
  const { workspace } = useParams();
  const [currentTopic, setCurrentTopic] = useState('');

  useEffect(() => { if (workspace) trackWorkspace(workspace); }, [workspace]);

  if (!workspace) return null;

  return (
    <WorkspaceProvider workspace={workspace}>
      <Routes>
        <Route path="join" element={<JoinView />} />
        <Route path="*" element={
          <WorkspaceLayout
            key={workspace}
            workspace={workspace}
            currentTopic={currentTopic}
            onTopicChange={setCurrentTopic}
          />
        } />
      </Routes>
    </WorkspaceProvider>
  );
}

function WorkspaceLayout({ workspace, currentTopic, onTopicChange }: {
  workspace: string;
  currentTopic: string;
  onTopicChange: (t: string) => void;
}) {
  const { expanded, toggle } = useSidebarState(workspace);
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
      </div>
      <div className="workspace-layout">
        {expanded && (
          <div className="sidebar-region">
            <div className="sidebar-backdrop" onClick={toggle} />
            <aside className="sidebar">
              <div className="sidebar-header">
                <span className="sidebar-title">{workspace}</span>
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
            <Route path="search" element={<SearchView />} />
            <Route path="new" element={<PostEditorView onTopicChange={onTopicChange} />} />
            <Route path="*" element={<BrowseView onTopicChange={onTopicChange} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
