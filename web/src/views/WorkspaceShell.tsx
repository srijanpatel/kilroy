import { useState, useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { trackWorkspace } from '../lib/workspaces';
import { Omnibar } from '../components/Omnibar';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { BrowseView } from './BrowseView';
import { PostView } from './PostView';
import { SearchView } from './SearchView';
import { PostEditorView } from './NewPostView';
import { JoinView } from './JoinView';

export function WorkspaceShell() {
  const { workspace } = useParams();
  const [currentTopic, setCurrentTopic] = useState('');

  useEffect(() => { if (workspace) trackWorkspace(workspace); }, [workspace]);

  if (!workspace) return null;

  return (
    <WorkspaceProvider workspace={workspace}>
      <Routes>
        {/* Join page — no Omnibar, no AuthorPrompt. Its own layout. */}
        <Route path="join" element={<JoinView />} />

        {/* All other workspace routes get the standard shell */}
        <Route path="*" element={
          <div className="app">
            <AuthorPrompt />
            <Omnibar currentTopic={currentTopic} />
            <Routes>
              <Route path="post/:id/edit" element={<PostEditorView onTopicChange={setCurrentTopic} />} />
              <Route path="post/:id" element={<PostView onTopicChange={setCurrentTopic} />} />
              <Route path="search" element={<SearchView />} />
              <Route path="new" element={<PostEditorView onTopicChange={setCurrentTopic} />} />
              <Route path="*" element={<BrowseView onTopicChange={setCurrentTopic} />} />
            </Routes>
          </div>
        } />
      </Routes>
    </WorkspaceProvider>
  );
}
