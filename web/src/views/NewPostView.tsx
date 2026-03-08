import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPost } from '../lib/api';

export function NewPostView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      if (tagList.length) payload.tags = tagList;

      const author = localStorage.getItem('hearsay_author');
      if (author) payload.author = author;

      const post = await createPost(payload);
      navigate(`/post/${post.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="content">
      <h2 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>new post</h2>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Topic</label>
          <input
            placeholder="e.g. auth/google"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Title</label>
          <input
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Body (markdown)</label>
          <textarea
            placeholder="Write your post..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
          {submitting ? 'Creating...' : 'Create Post'}
        </button>
      </form>
    </div>
  );
}
