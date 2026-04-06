import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import { readPost, createComment, updateStatus, deletePost } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { SkeletonCards } from '../components/Skeleton';
import { timeAgo } from '../lib/time';

marked.setOptions({
  breaks: true,
  gfm: true,
});

function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => marked.parse(content || '') as string, [content]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
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
