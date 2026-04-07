import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { readPost, createComment, updateStatus, deletePost } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { Markdown } from '../components/Markdown';
import { SkeletonCards } from '../components/Skeleton';
import { timeAgo } from '../lib/time';

function formatTimestamp(iso?: string) {
  return iso ? new Date(iso).toISOString() : 'unknown';
}

function sanitizeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

function buildPostMarkdown(post: any, workspace: string) {
  const metadata = [
    `# ${post.title}`,
    '',
    `- Workspace: \`${workspace}\``,
    `- Topic: \`${post.topic}\``,
    `- Status: \`${post.status}\``,
    `- Author: ${post.author || 'anonymous'}`,
    `- Created: ${formatTimestamp(post.created_at)}`,
    `- Updated: ${formatTimestamp(post.updated_at)}`,
  ];

  if (post.tags?.length) {
    metadata.push(`- Tags: ${post.tags.map((tag: string) => `\`${tag}\``).join(', ')}`);
  }

  const sections = [metadata.join('\n'), '', post.body ?? ''];

  if (post.comments?.length) {
    sections.push('', '## Comments', '');
    for (const comment of post.comments) {
      sections.push(`### ${comment.author || 'anonymous'} · ${formatTimestamp(comment.created_at)}`);
      sections.push('');
      sections.push(comment.body ?? '');
      sections.push('');
    }
  }

  return sections.join('\n');
}

export function PostView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const tp = useWorkspacePath();

  const [post, setPost] = useState<any>(null);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    if (!id) return;
    setError('');
    readPost(workspace, id).then((data) => {
      setPost(data);
      onTopicChange(data.topic);
    }).catch((e) => setError(e.message));
  };

  useEffect(load, [id]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentBody(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleComment = async () => {
    if (!commentBody.trim() || !id) return;
    setSubmitting(true);
    try {
      const author = localStorage.getItem('kilroy_author') || undefined;
      await createComment(workspace, id, { body: commentBody, author });
      setCommentBody('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (newStatus: string) => {
    if (!id) return;
    try {
      await updateStatus(workspace, id, newStatus);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Permanently delete this post?')) return;
    try {
      await deletePost(workspace, id);
      navigate(post?.topic ? tp(`/${post.topic}/`) : tp('/'));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!post) return;
    const markdown = buildPostMarkdown(post, workspace);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${sanitizeFilenamePart(post.title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (error) return <div className="content reading"><div className="error">{error}</div></div>;
  if (!post) return <div className="content reading"><SkeletonCards count={1} /></div>;

  return (
    <div className="content reading">
      <article className="post-detail">
        <h1>{post.title}</h1>

        {post.status !== 'active' && (
          <div className={`post-status-banner post-status-banner-${post.status}`}>
            {post.status === 'archived' ? 'This post has been archived.' : 'This post is obsolete.'}
          </div>
        )}

        <div className="post-meta-line">
          {post.author && <span>{post.author}</span>}
          {post.author && <span className="meta-sep"> · </span>}
          <span>{post.created_at?.slice(0, 10)}</span>
        </div>

        {post.tags?.length > 0 && (
          <div className="post-tags">
            {post.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        <div className="post-actions">
          <button className="text-action" onClick={() => navigate(tp(`/_/post/${post.id}/edit`))}>edit</button>
          {post.status === 'active' && (
            <>
              <button className="text-action" onClick={() => handleStatus('archived')}>archive</button>
              <button className="text-action" onClick={() => handleStatus('obsolete')}>mark obsolete</button>
            </>
          )}
          {(post.status === 'archived' || post.status === 'obsolete') && (
            <button className="text-action" onClick={() => handleStatus('active')}>restore</button>
          )}
          <button className="text-action text-action-danger" onClick={handleDelete}>delete</button>
          <button className="text-action" onClick={handleDownloadMarkdown}>download markdown</button>
          <button className="text-action" onClick={() => window.print()}>export pdf</button>
        </div>

        <Markdown content={post.body} className="post-body prose" />

        <hr className="comments-divider" />
        <div className="comments-heading">
          Comments ({post.comments?.length || 0})
        </div>

        {post.comments?.map((c: any) => (
          <div key={c.id} className="comment">
            <div className="comment-header">
              <span className="comment-author">{c.author || 'anonymous'}</span>
              <span className="comment-time"> · {timeAgo(c.created_at)}</span>
            </div>
            <Markdown content={c.body} className="comment-body prose" />
          </div>
        ))}

        <div className="comment-form">
          <textarea
            ref={textareaRef}
            placeholder="Add a comment..."
            value={commentBody}
            onChange={handleTextareaChange}
            rows={2}
          />
          <button
            className="btn btn-primary"
            onClick={handleComment}
            disabled={submitting || !commentBody.trim()}
          >
            {submitting ? 'Posting...' : 'Reply'}
          </button>
        </div>
      </article>
    </div>
  );
}
