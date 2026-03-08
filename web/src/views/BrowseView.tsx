import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { browse } from '../lib/api';
import { Breadcrumb } from '../components/Breadcrumb';
import { SkeletonCards, EmptyState } from '../components/Skeleton';
import { timeAgo } from '../lib/time';

export function BrowseView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const params = useParams();
  const topic = params['*'] || '';
  // Strip trailing slash from route param
  const cleanTopic = topic.replace(/\/$/, '');
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('updated_at');
  const [error, setError] = useState('');

  useEffect(() => { onTopicChange(cleanTopic); }, [cleanTopic]);

  useEffect(() => {
    setError('');
    const params: Record<string, string> = {};
    if (cleanTopic) params.topic = cleanTopic;
    if (status !== 'active') params.status = status;
    if (sort !== 'updated_at') params.order_by = sort;

    browse(params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [cleanTopic, status, sort]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="content"><SkeletonCards count={5} /></div>;

  return (
    <div className="content">
      <Breadcrumb topic={cleanTopic} />

      <div className="controls">
        <label>Status:
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="obsolete">Obsolete</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>Sort:
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated_at">Updated</option>
            <option value="created_at">Created</option>
            <option value="title">Title</option>
          </select>
        </label>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => navigate(`/new${cleanTopic ? `?topic=${encodeURIComponent(cleanTopic)}` : ''}`)}>
          + New Post
        </button>
      </div>

      {data.subtopics?.map((st: any, i: number) => (
        <div
          key={st.name}
          className="card folder-card card-animate"
          style={{ animationDelay: `${i * 30}ms` }}
          onClick={() => navigate(`/${cleanTopic ? cleanTopic + '/' : ''}${st.name}/`)}
        >
          <div className="card-title">
            <span className="card-title-text">
              <span className="folder-icon">{'\u{1F4C1}'}</span>
              {st.name}/
            </span>
          </div>
          <div className="card-meta">
            {st.post_count} {st.post_count === 1 ? 'post' : 'posts'} · {st.contributor_count} {st.contributor_count === 1 ? 'contributor' : 'contributors'}
            {st.updated_at && <> · updated {timeAgo(st.updated_at)}</>}
          </div>
          {st.tags?.length > 0 && (
            <div className="card-tags">
              {st.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
        </div>
      ))}

      {data.posts?.map((p: any, i: number) => (
        <div
          key={p.id}
          className={`card status-border-${p.status} card-animate`}
          style={{ animationDelay: `${(data.subtopics?.length || 0) * 30 + i * 30}ms` }}
          onClick={() => navigate(`/post/${p.id}`)}
        >
          <div className="card-title">
            <span className="card-title-text">{p.title}</span>
            <span className={`status status-${p.status}`}>{p.status}</span>
          </div>
          <div className="card-meta">
            {p.author || 'anonymous'} · {timeAgo(p.updated_at)} · {p.comment_count} {p.comment_count === 1 ? 'comment' : 'comments'}
          </div>
          {p.tags?.length > 0 && (
            <div className="card-tags">
              {p.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
          {p.files?.length > 0 && (
            <div className="card-files">{p.files.join(', ')}</div>
          )}
        </div>
      ))}

      {!data.subtopics?.length && !data.posts?.length && (
        <EmptyState
          message="nothing here yet"
          actionLabel="+ Create the first post"
          onAction={() => navigate(`/new${cleanTopic ? `?topic=${encodeURIComponent(cleanTopic)}` : ''}`)}
        />
      )}

      {data.has_more && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <span className="mono" style={{ color: 'var(--text-dim)' }}>More results available</span>
        </div>
      )}
    </div>
  );
}
