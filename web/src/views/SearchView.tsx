import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { search } from '../lib/api';
import { EmptyState } from '../components/Skeleton';

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
            className="form-group"
            style={{
              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '4px', padding: '0.5rem 0.75rem', color: 'var(--text)',
              fontSize: '0.9rem', outline: 'none',
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

      {data?.results?.map((r: any) => (
        <div key={r.post_id} className="card" onClick={() => navigate(`/post/${r.post_id}`)}>
          <div className="card-title">
            {r.title}
            <span className={`status status-${r.status}`}>{r.status}</span>
          </div>
          <div className="card-meta">
            <span className="mono">{r.topic}</span> · {r.match_location}
          </div>
          {r.tags?.length > 0 && (
            <div className="card-tags">
              {r.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
          {r.snippet && <div className="snippet">{r.snippet}</div>}
        </div>
      ))}

      {data && !data.results?.length && (
        <EmptyState message="no results found" />
      )}
    </div>
  );
}
