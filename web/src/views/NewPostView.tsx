import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createPost, readPost, updatePost } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { SkeletonCards } from '../components/Skeleton';

export function PostEditorView({ onTopicChange }: { onTopicChange: (t: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = useWorkspace();
  const tp = useWorkspacePath();
  const isEditing = Boolean(id);

  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && !id) return;

    if (!isEditing) {
      const initialTopic = searchParams.get('topic') || '';
      setTopic(initialTopic);
      onTopicChange(initialTopic);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    readPost(workspace, id!)
      .then((post) => {
        setTopic(post.topic || '');
        setTitle(post.title || '');
        setBody(post.body || '');
        setTags((post.tags || []).join(', '));
        onTopicChange(post.topic || '');
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isEditing, onTopicChange, searchParams, workspace]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.style.height = 'auto';
    bodyRef.current.style.height = bodyRef.current.scrollHeight + 'px';
  }, [body]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !title.trim() || !body.trim()) {
      setError('Topic, title, and body are required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload: Record<string, any> = {
        topic: topic.trim(),
        title: title.trim(),
        body: body.trim(),
      };

      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      payload.tags = tagList;

      const author = localStorage.getItem('kilroy_author');
      if (author) payload.author = author;

      const post = isEditing && id
        ? await updatePost(workspace, id, payload)
        : await createPost(workspace, payload);

      navigate(tp(`/_/post/${post.id}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  if (loading) return <div className="content reading"><SkeletonCards count={1} /></div>;

  return (
    <div className="content reading">
      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-heading">
          <div className="form-kicker">{isEditing ? 'Edit Post' : 'New Post'}</div>
          <h1 className="form-title">{isEditing ? 'Update post' : 'Write something worth keeping'}</h1>
        </div>

        <div className="form-group">
          <label>Topic</label>
          <input
            placeholder="e.g. auth/google"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <input
          className="title-input"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="form-group" style={{ marginTop: '1.25rem' }}>
          <label>Body</label>
          <textarea
            ref={bodyRef}
            placeholder="Write your knowledge..."
            value={body}
            onChange={handleBodyChange}
            rows={8}
          />
        </div>

        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input
            placeholder="e.g. gotcha, oauth"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? (isEditing ? 'Saving...' : 'Publishing...') : (isEditing ? 'Save Changes' : 'Publish')}
        </button>
      </form>
    </div>
  );
}
