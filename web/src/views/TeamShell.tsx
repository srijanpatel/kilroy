import { useState, useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { TeamProvider } from '../context/TeamContext';
import { trackTeam } from '../lib/teams';
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

  useEffect(() => { if (team) trackTeam(team); }, [team]);

  if (!team) return null;

  return (
    <TeamProvider team={team}>
      <Routes>
        {/* Join page — no Omnibar, no AuthorPrompt. Its own layout. */}
        <Route path="join" element={<JoinView />} />

        {/* All other team routes get the standard shell */}
        <Route path="*" element={
          <div className="app">
            <AuthorPrompt />
            <Omnibar currentTopic={currentTopic} />
            <Routes>
              <Route path="post/:id" element={<PostView onTopicChange={setCurrentTopic} />} />
              <Route path="search" element={<SearchView />} />
              <Route path="new" element={<NewPostView />} />
              <Route path="*" element={<BrowseView onTopicChange={setCurrentTopic} />} />
            </Routes>
          </div>
        } />
      </Routes>
    </TeamProvider>
  );
}
