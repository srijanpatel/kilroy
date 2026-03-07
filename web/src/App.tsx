import { useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { BrowseView } from './views/BrowseView';
import { PostView } from './views/PostView';
import { SearchView } from './views/SearchView';
import { NewPostView } from './views/NewPostView';

export default function App() {
  const [activeTopic, setActiveTopic] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1><Link to="/">Hearsay</Link></h1>
        <form className="search-box" onSubmit={handleSearch}>
          <input
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
      </header>
      <div className="main">
        <Sidebar activeTopic={activeTopic} />
        <Routes>
          <Route path="/post/:id" element={<PostView onTopicChange={setActiveTopic} />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/new" element={<NewPostView />} />
          <Route path="*" element={<BrowseView onTopicChange={setActiveTopic} />} />
        </Routes>
      </div>
    </div>
  );
}
