import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { search } from '../lib/api';
import { EmptyState } from '../components/Skeleton';

function highlightSnippet(snippet: string, query: string) {
  if (!snippet || !query) return snippet;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = snippet.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part
  );
}

export function SearchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';

  const [input, setInput] = useState(query);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('active');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query) { setData(null); return; }
    setError('');
    const params: Record<string, string> = { query };
    if (status !== 'active') params.status = status;

    search(params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [query, status]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      setSearchParams({ q: input.trim() });
    }
  };

  return (
    <div className="content">
      <div className="search-header">
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            style={{
              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '0.5rem 0.75rem', color: 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none',
            }}
            placeholder="Search posts..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>

        {query && (
          <div className="controls">
            <label>Status:
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="obsolete">Obsolete</option>
                <option value="all">All</option>
              </select>
            </label>
            {data && <span className="count">{data.results?.length || 0} results</span>}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {data?.results?.map((r: any, i: number) => (
        <div
          key={r.post_id}
          className={`card status-border-${r.status} card-animate`}
          style={{ animationDelay: `${i * 30}ms` }}
          onClick={() => navigate(`/post/${r.post_id}`)}
        >
          <div className="card-title">
            <span className="card-title-text">{r.title}</span>
            <span className={`status status-${r.status}`}>{r.status}</span>
          </div>
          <div className="card-meta">
            <span className="mono">{r.topic}</span>
            {r.match_location && <> · <span className="match-location">{r.match_location}</span></>}
          </div>
          {r.tags?.length > 0 && (
            <div className="card-tags">
              {r.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
          {r.snippet && <div className="snippet">{highlightSnippet(r.snippet, query)}</div>}
        </div>
      ))}

      {data && !data.results?.length && (
        <EmptyState message="no results found" />
      )}
    </div>
  );
}
