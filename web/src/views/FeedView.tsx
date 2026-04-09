import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { search } from '../lib/api';
import { useProject, useProjectPath } from '../context/ProjectContext';
import { InviteCard } from '../components/InviteCard';

interface FeedViewProps {
  selectedTags: string[];
}

export function FeedView({ selectedTags }: FeedViewProps) {
  const { accountSlug, projectSlug } = useProject();
  const pp = useProjectPath();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('active');
  const [sortBy, setSortBy] = useState('updated_at');

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {
      status,
      order_by: sortBy,
      limit: '50',
    };
    if (selectedTags.length > 0) {
      params.tags = selectedTags.join(',');
    }
    search(accountSlug, projectSlug, params)
      .then((data) => setPosts(data.results || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [accountSlug, projectSlug, selectedTags, status, sortBy]);

  return (
    <div className="feed-view">
      <div className="feed-controls">
        <div className="feed-status-filters">
          {['active', 'archived', 'obsolete', 'all'].map((s) => (
            <button
              key={s}
              className={`feed-status-btn ${status === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          className="feed-sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="updated_at">Updated</option>
          <option value="created_at">Created</option>
          <option value="relevance">Relevance</option>
        </select>
      </div>

      {loading && <div className="feed-loading">Loading...</div>}

      {!loading && posts.length === 0 && (
        <div className="feed-empty">
          {selectedTags.length > 0 ? (
            <p>No posts matching these tags.</p>
          ) : (
            <InviteCard />
          )}
        </div>
      )}

      {posts.map((post) => (
        <Link key={post.post_id} to={pp(`/post/${post.post_id}`)} className="feed-post-card">
          <div className="feed-post-title">{post.title}</div>
          {post.snippet && (
            <div className="feed-post-snippet" dangerouslySetInnerHTML={{
              __html: post.snippet.replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>')
            }} />
          )}
          <div className="feed-post-meta">
            {post.tags && post.tags.length > 0 && (
              <span className="feed-post-tags">
                {post.tags.map((t: string) => (
                  <span key={t} className="feed-tag">{t}</span>
                ))}
              </span>
            )}
            <span className="feed-post-date">
              {new Date(post.updated_at).toLocaleDateString()}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
