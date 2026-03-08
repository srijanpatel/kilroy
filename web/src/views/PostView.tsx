import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { readPost, createComment, updateStatus, deletePost } from '../lib/api';
import { Breadcrumb } from '../components/Breadcrumb';
import { SkeletonCards } from '../components/Skeleton';
import { timeAgo } from '../lib/time';

export function PostView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<any>(null);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!id) return;
    setError('');
    readPost(id).then((data) => {
      setPost(data);
      onTopicChange(data.topic);
    }).catch((e) => setError(e.message));
  };

  useEffect(load, [id]);

  const handleComment = async () => {
    if (!commentBody.trim() || !id) return;
    setSubmitting(true);
    try {
      const author = localStorage.getItem('hearsay_author') || undefined;
      await createComment(id, { body: commentBody, author });
      setCommentBody('');
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

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!post) return <div className="content"><SkeletonCards count={1} /></div>;

  return (
    <div className="content">
      <Breadcrumb topic={post.topic} />

      <div className="post-detail">
        <h1>{post.title}</h1>

        <div className="post-meta">
          <span className="meta-label">status</span>
          <span className="meta-value"><span className={`status status-${post.status}`}>{post.status}</span></span>

          {post.author && <>
            <span className="meta-label">author</span>
            <span className="meta-value">{post.author}</span>
          </>}

          <span className="meta-label">created</span>
          <span className="meta-value">{post.created_at?.slice(0, 10)}</span>

          <span className="meta-label">updated</span>
          <span className="meta-value">{post.updated_at?.slice(0, 10)}</span>

          {post.commit_sha && <>
            <span className="meta-label">commit</span>
            <span className="meta-value">{post.commit_sha}</span>
          </>}

          {post.tags?.length > 0 && <>
            <span className="meta-label">tags</span>
            <span className="meta-value">
              <span className="card-tags" style={{ display: 'inline-flex' }}>
                {post.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
              </span>
            </span>
          </>}

          {post.files?.length > 0 && <>
            <span className="meta-label">files</span>
            <span className="meta-value">{post.files.join(', ')}</span>
          </>}

          {post.contributors?.length > 0 && <>
            <span className="meta-label">contributors</span>
            <span className="meta-value">{post.contributors.join(', ')}</span>
          </>}
        </div>

        <div className="post-actions">
          {post.status === 'active' && (
            <>
              <button className="btn" onClick={() => handleStatus('archived')}>Archive</button>
              <button className="btn" onClick={() => handleStatus('obsolete')}>Obsolete</button>
            </>
          )}
          {(post.status === 'archived' || post.status === 'obsolete') && (
            <button className="btn" onClick={() => handleStatus('active')}>Restore</button>
          )}
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>

        <div className="post-body">{post.body}</div>

        <div className="comments-header">
          Comments ({post.comments?.length || 0})
        </div>

        {post.comments?.map((c: any) => (
          <div key={c.id} className="comment">
            <div className="comment-author">
              {c.author || 'anonymous'} <span className="time">· {timeAgo(c.created_at)}</span>
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        ))}

        <div className="form-group">
          <textarea
            placeholder="Add a comment..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleComment}
          disabled={submitting || !commentBody.trim()}
        >
          {submitting ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
    </div>
  );
}
