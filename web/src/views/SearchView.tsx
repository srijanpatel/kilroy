import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { search } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const tp = useWorkspacePath();
  const query = searchParams.get('q') || '';

  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('active');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query) { setData(null); return; }
    setError('');
    setData(null);
    const params: Record<string, string> = { query };
    if (status !== 'active') params.status = status;

    search(workspace, params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [query, status]);

  if (!query) return (
    <div className="content">
      <EmptyState
        title="Search Kilroy"
        message="Use the omnibar above (⌘K) to search across all posts."
      />
    </div>
  );

  return (
    <div className="content">
      <div className="search-header">
        <h2>Results for &ldquo;{query}&rdquo;</h2>
        <div className="controls" style={{ marginTop: '0.75rem' }}>
          <label>Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="obsolete">Obsolete</option>
              <option value="all">All</option>
            </select>
          </label>
          {data && <span className="search-count">{data.results?.length || 0} results</span>}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {data?.results?.map((r: any, i: number) => (
        <div
          key={r.post_id}
          className="card card-animate"
          style={{ animationDelay: `${i * 30}ms` }}
          onClick={() => navigate(tp(`/post/${r.post_id}`))}
        >
          <div className="card-title">
            <span className="card-title-text">{r.title}</span>
            <span className={`status-dot status-dot-${r.status}`} />
          </div>
          <div className="card-meta">
            {r.topic}
            {r.match_location && <> · <span className="match-location">{r.match_location}</span></>}
          </div>
          {r.snippet && <div className="snippet">{highlightSnippet(r.snippet, query)}</div>}
        </div>
      ))}

      {data && !data.results?.length && (
        <EmptyState
          title="No results"
          message={`Nothing matched \u201c${query}\u201d. Try a different search term.`}
        />
      )}
    </div>
  );
}
