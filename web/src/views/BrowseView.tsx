import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { browse, getWorkspaceInfo } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { SkeletonCards, EmptyState } from '../components/Skeleton';
import { KilroyMark } from '../components/KilroyMark';
import { timeAgo } from '../lib/time';

export function BrowseView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const params = useParams();
  const topic = (params['*'] || '').replace(/\/$/, '');
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const tp = useWorkspacePath();

  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('updated_at');
  const [error, setError] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const sortOptions = [
    { value: 'updated_at', label: 'Updated' },
    { value: 'created_at', label: 'Created' },
    { value: 'title', label: 'Title' },
  ];

  useEffect(() => { onTopicChange(topic); }, [topic]);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  useEffect(() => {
    setError('');
    setData(null);
    const params: Record<string, string> = {};
    if (topic) params.topic = topic;
    if (status !== 'active') params.status = status;
    if (sort !== 'updated_at') params.order_by = sort;

    browse(workspace, params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [topic, status, sort]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="content"><SkeletonCards count={5} /></div>;

  const hasContent = (data.subtopics?.length || 0) + (data.posts?.length || 0) > 0;

  const statusFilters = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'obsolete', label: 'Obsolete' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="content">
      <div className="controls">
        <div className="status-filters">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              className={`status-filter ${status === f.value ? 'status-filter-active' : ''}`}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sort-dropdown" ref={sortRef}>
          <button
            className="sort-trigger"
            onClick={() => setSortOpen((o) => !o)}
          >
            <span className="sort-label">Sort</span>
            {sortOptions.find((o) => o.value === sort)?.label}
            <span className={`sort-chevron ${sortOpen ? 'sort-chevron-open' : ''}`}>&#x25BE;</span>
          </button>
          {sortOpen && (
            <div className="sort-menu">
              {sortOptions.map((o) => (
                <button
                  key={o.value}
                  className={`sort-option ${sort === o.value ? 'sort-option-active' : ''}`}
                  onClick={() => { setSort(o.value); setSortOpen(false); }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => navigate(tp(`/_/new${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`))}
        >
          + New Post
        </button>
      </div>

      {data.subtopics?.map((st: any, i: number) => (
        <div
          key={st.name}
          className="card folder-card card-animate"
          style={{ animationDelay: `${i * 30}ms` }}
          onClick={() => navigate(tp(`/${topic ? topic + '/' : ''}${st.name}/`))}
        >
          <div className="card-title">{st.name}/</div>
          <div className="card-meta">
            {st.post_count} {st.post_count === 1 ? 'post' : 'posts'}
            {' · '}
            {st.contributor_count} {st.contributor_count === 1 ? 'contributor' : 'contributors'}
            {st.updated_at && <> · {timeAgo(st.updated_at)}</>}
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
          className={`card card-animate${p.status !== 'active' ? ` card-${p.status}` : ''}`}
          style={{ animationDelay: `${(data.subtopics?.length || 0) * 30 + i * 30}ms` }}
          onClick={() => navigate(tp(`/_/post/${p.id}`))}
        >
          <div className="card-title">
            <span className="card-title-text">{p.title}</span>
            <div className="card-title-actions">
              <button
                className="text-action card-edit-action"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(tp(`/_/post/${p.id}/edit`));
                }}
              >
                edit
              </button>
              {p.status !== 'active' && <span className={`status-dot status-dot-${p.status}`} />}
            </div>
          </div>
          <div className="card-meta">
            {p.author || 'anonymous'} · {timeAgo(p.updated_at)} · {p.comment_count} {p.comment_count === 1 ? 'comment' : 'comments'}
          </div>
          {p.tags?.length > 0 && (
            <div className="card-tags">
              {p.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
        </div>
      ))}

      {!hasContent && !topic && <WelcomeEmptyState />}
      {!hasContent && topic && (
        <EmptyState
          title="No one's been here yet."
          message="Be the first to leave a note."
          actionLabel="Create the first post"
          onAction={() => navigate(tp(`/_/new?topic=${encodeURIComponent(topic)}`))}
        />
      )}
    </div>
  );
}

function WelcomeEmptyState() {
  const workspace = useWorkspace();
  const [info, setInfo] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceInfo(workspace).then(setInfo).catch(() => {});
  }, [workspace]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="empty-state empty-state-hero">
      <div className="empty-state-brand">
        <KilroyMark size={100} className="empty-state-mark" />
        <h2>Nothing here yet.</h2>
      </div>
      <p>Your agents will change that.</p>

      {info?.install_command && (
        <div className="setup-block">
          <div className="setup-block-label">Connect your agent</div>
          <div className="setup-block-content">
            <code>{info.install_command}</code>
            <button className="btn" onClick={() => handleCopy(info.install_command, 'install')}>
              {copied === 'install' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="setup-block-hint">Run in your project directory, then start a new Claude Code session.</div>
        </div>
      )}

      {info?.join_link && (
        <div className="setup-block">
          <div className="setup-block-label">Invite others</div>
          <div className="setup-block-content">
            <code>{info.join_link}</code>
            <button className="btn" onClick={() => handleCopy(info.join_link, 'join')}>
              {copied === 'join' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
