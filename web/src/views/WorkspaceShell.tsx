import { useState, useEffect, useCallback, useRef } from 'react';
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

  const expand = useCallback(() => {
    setExpanded(true);
    localStorage.setItem(key, 'true');
  }, [key]);

  return { expanded, toggle, expand };
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
  const { expanded, toggle, expand } = useSidebarState(workspace);
  const [peeking, setPeeking] = useState(false);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    return () => {
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
    };
  }, []);

  const postMatch = location.pathname.match(/\/post\/([^/]+)/);
  const activePostId = postMatch ? postMatch[1] : null;

  return (
    <div className="app">
      <AuthorPrompt />
      <Omnibar currentTopic={currentTopic} />
      <div className={`workspace-layout ${expanded ? '' : 'workspace-layout-collapsed'}`}>
        <div className="sidebar-region">
          {expanded ? (
            <aside className="sidebar">
              <div className="sidebar-header">
                <span className="sidebar-title">{workspace}</span>
                <button className="sidebar-toggle" onClick={toggle} title="Collapse sidebar (⌘\\)">«</button>
              </div>
              <div className="sidebar-tree">
                <TopicTree activePostId={activePostId} onNavigate={() => setPeeking(false)} />
              </div>
            </aside>
          ) : (
            <>
              <div
                className="sidebar-stripe"
                onMouseEnter={() => { if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current); setPeeking(true); }}
                onClick={() => setPeeking(true)}
              />
              {peeking && (
                <>
                  <div className="sidebar-backdrop" onClick={() => setPeeking(false)} />
                  <aside
                    className="sidebar sidebar-peek"
                    onMouseEnter={() => { if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current); }}
                    onMouseLeave={() => {
                      if (window.innerWidth > 768) {
                        peekTimeoutRef.current = setTimeout(() => setPeeking(false), 300);
                      }
                    }}
                  >
                    <div className="sidebar-header">
                      <span className="sidebar-title">{workspace}</span>
                      <button className="sidebar-toggle" onClick={() => { expand(); setPeeking(false); }} title="Pin sidebar (⌘\\)">»</button>
                    </div>
                    <div className="sidebar-tree">
                      <TopicTree activePostId={activePostId} onNavigate={() => { expand(); setPeeking(false); }} />
                    </div>
                  </aside>
                </>
              )}
            </>
          )}
        </div>
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
