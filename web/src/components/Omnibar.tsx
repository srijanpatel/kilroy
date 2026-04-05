import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { browse, search, getWorkspaceInfo } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { KilroyMark } from './KilroyMark';

interface OmnibarProps {
  currentTopic: string;
}

function getInitialTheme(): string {
  const stored = localStorage.getItem('kilroy_theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Omnibar({ currentTopic }: OmnibarProps) {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const tp = useWorkspacePath();
  const [active, setActive] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kilroy_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => t === 'dark' ? 'light' : 'dark');
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [allTopics, setAllTopics] = useState<string[]>([]);
  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getWorkspaceInfo(workspace)
      .then((info) => setJoinLink(info?.join_link || null))
      .catch(() => {});
  }, [workspace]);

  useEffect(() => {
    if (!inviteOpen) return;
    const handler = (e: MouseEvent) => {
      if (inviteRef.current && !inviteRef.current.contains(e.target as Node)) {
        setInviteOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inviteOpen]);

  useEffect(() => {
    browse(workspace, { recursive: 'true', status: 'all', limit: '200' })
      .then((data) => {
        const paths = new Set<string>();
        for (const p of data.posts || []) {
          const parts = p.topic.split('/');
          for (let i = 1; i <= parts.length; i++) {
            paths.add(parts.slice(0, i).join('/'));
          }
        }
        setAllTopics(Array.from(paths).sort());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setTopics([]);
      setPosts([]);
      return;
    }

    const q = query.toLowerCase();
    const matchedTopics = allTopics
      .filter((t) => t.toLowerCase().includes(q))
      .slice(0, 5);
    setTopics(matchedTopics);

    const timer = setTimeout(() => {
      search(workspace, { query: query.trim(), status: 'all', limit: '5' })
        .then((data) => setPosts(data.results || []))
        .catch(() => setPosts([]));
    }, 200);

    return () => clearTimeout(timer);
  }, [query, allTopics]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [topics, posts]);

  const totalResults = topics.length + posts.length;

  const activate = useCallback(() => {
    setActive(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const deactivate = useCallback(() => {
    setActive(false);
    setQuery('');
    setTopics([]);
    setPosts([]);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !active)) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        activate();
      }
      if (e.key === 'Escape' && active) {
        deactivate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, activate, deactivate]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        deactivate();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, deactivate]);

  const handleSelect = (index: number) => {
    if (index < topics.length) {
      navigate(tp(`/${topics[index]}/`));
    } else {
      const post = posts[index - topics.length];
      if (post) navigate(tp(`/post/${post.post_id}`));
    }
    deactivate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalResults - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelect(selectedIndex);
      } else if (query.trim()) {
        navigate(tp(`/search?q=${encodeURIComponent(query.trim())}`));
        deactivate();
      }
    }
  };

  const segments = currentTopic ? currentTopic.split('/') : [];

  return (
    <div className="omnibar-wrapper">
      <div className={`omnibar ${active ? 'active' : ''}`} ref={wrapperRef}>
        {active ? (
          <>
            <input
              ref={inputRef}
              className="omnibar-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search posts or navigate to a topic..."
            />
            {query.trim() && (topics.length > 0 || posts.length > 0) && (
              <div className="omnibar-dropdown">
                {topics.length > 0 && (
                  <div className="omnibar-results-group">
                    <div className="omnibar-group-label">Topics</div>
                    {topics.map((t, i) => (
                      <div
                        key={t}
                        className={`omnibar-result-item ${selectedIndex === i ? 'selected' : ''}`}
                        onClick={() => handleSelect(i)}
                        onMouseEnter={() => setSelectedIndex(i)}
                      >
                        <span className="omnibar-result-icon">&#x2192;</span>
                        <span className="omnibar-result-path">{t}/</span>
                      </div>
                    ))}
                  </div>
                )}
                {posts.length > 0 && (
                  <div className="omnibar-results-group">
                    <div className="omnibar-group-label">Posts</div>
                    {posts.map((p, i) => (
                      <div
                        key={p.post_id}
                        className={`omnibar-result-item ${selectedIndex === topics.length + i ? 'selected' : ''}`}
                        onClick={() => handleSelect(topics.length + i)}
                        onMouseEnter={() => setSelectedIndex(topics.length + i)}
                      >
                        <span className="omnibar-result-title">{p.title}</span>
                        <span className="omnibar-result-topic">{p.topic}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="omnibar-resting" onClick={activate}>
            <Link to="/" className="omnibar-home" onClick={(e) => e.stopPropagation()} title="Kilroy — switch workspaces">
              <KilroyMark size={22} />
            </Link>
            <Link to={tp('/')} className="omnibar-wordmark" onClick={(e) => e.stopPropagation()}>
              {workspace}<span className="omnibar-sep">/</span>
            </Link>
            {segments.length > 0 && (
              <span className="omnibar-path">
                {segments.map((seg, i) => {
                  const path = segments.slice(0, i + 1).join('/');
                  return (
                    <span key={path}>
                      {i > 0 && <span className="omnibar-sep">/</span>}
                      <Link
                        to={tp(`/${path}/`)}
                        className="omnibar-segment"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {seg}
                      </Link>
                    </span>
                  );
                })}
              </span>
            )}
            <span className="omnibar-hint">
              <kbd>⌘K</kbd>
            </span>
            {joinLink && (
              <div className="invite-wrapper" ref={inviteRef}>
                <button
                  className="invite-btn"
                  onClick={(e) => { e.stopPropagation(); setInviteOpen((o) => !o); }}
                  title="Invite others"
                >
                  + Invite
                </button>
                {inviteOpen && (
                  <div className="invite-popover">
                    <div className="invite-popover-label">Invite others</div>
                    <div className="invite-popover-row">
                      <code className="invite-popover-link">{joinLink}</code>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(joinLink);
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 2000);
                        }}
                      >
                        {inviteCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              className="theme-toggle"
              onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '\u2600' : '\u263E'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
