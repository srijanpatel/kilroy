import { useState } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { TeamProvider } from '../context/TeamContext';
import { Omnibar } from '../components/Omnibar';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { BrowseView } from './BrowseView';
import { PostView } from './PostView';
import { SearchView } from './SearchView';
import { NewPostView } from './NewPostView';
import { JoinView } from './JoinView';

export function TeamShell() {
  const { team } = useParams();
  const [currentTopic, setCurrentTopic] = useState('');

  if (!team) return null;

  return (
    <TeamProvider team={team}>
      <div className="app">
        <AuthorPrompt />
        <Omnibar currentTopic={currentTopic} />
        <Routes>
          <Route path="join" element={<JoinView />} />
          <Route path="post/:id" element={<PostView onTopicChange={setCurrentTopic} />} />
          <Route path="search" element={<SearchView />} />
          <Route path="new" element={<NewPostView />} />
          <Route path="*" element={<BrowseView onTopicChange={setCurrentTopic} />} />
        </Routes>
      </div>
    </TeamProvider>
  );
}
