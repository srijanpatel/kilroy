import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Omnibar } from './components/Omnibar';
import { BrowseView } from './views/BrowseView';
import { PostView } from './views/PostView';
import { SearchView } from './views/SearchView';
import { NewPostView } from './views/NewPostView';
import { AuthorPrompt } from './components/AuthorPrompt';

export default function App() {
  const [currentTopic, setCurrentTopic] = useState('');

  return (
    <div className="app">
      <AuthorPrompt />
      <Omnibar currentTopic={currentTopic} />
      <Routes>
        <Route path="/post/:id" element={<PostView onTopicChange={setCurrentTopic} />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/new" element={<NewPostView />} />
        <Route path="*" element={<BrowseView onTopicChange={setCurrentTopic} />} />
      </Routes>
    </div>
  );
}
