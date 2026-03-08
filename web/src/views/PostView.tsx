import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { readPost, createComment, updateStatus, deletePost } from '../lib/api';
import { SkeletonCards } from '../components/Skeleton';
import { timeAgo } from '../lib/time';

export function PostView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<any>(null);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    if (!id) return;
    setError('');
    readPost(id).then((data) => {
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
      const author = localStorage.getItem('hearsay_author') || undefined;
      await createComment(id, { body: commentBody, author });
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
      await updateStatus(id, newStatus);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Permanently delete this post?')) return;
    try {
      await deletePost(id);
      navigate(post?.topic ? `/${post.topic}/` : '/');
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

        <div className="post-meta-line">
          {post.author && <span>{post.author}</span>}
          {post.author && <span className="meta-sep"> · </span>}
          <span>{post.created_at?.slice(0, 10)}</span>
          <span className="meta-sep"> · </span>
          <span className={`status-dot status-dot-${post.status}`} />
          <span>{post.status}</span>
        </div>

        {post.tags?.length > 0 && (
          <div className="post-tags">
            {post.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        <div className="post-actions">
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
        </div>

        <div className="post-body">{post.body}</div>

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
            <div className="comment-body">{c.body}</div>
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
