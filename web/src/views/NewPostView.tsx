import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPost } from '../lib/api';
import { useTeam, useTeamPath } from '../context/TeamContext';

export function NewPostView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const team = useTeam();
  const tp = useTeamPath();

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

      const author = localStorage.getItem('kilroy_author');
      if (author) payload.author = author;

      const post = await createPost(team, payload);
      navigate(tp(`/post/${post.id}`));
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

  return (
    <div className="content reading">
      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
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
          {submitting ? 'Publishing...' : 'Publish'}
        </button>
      </form>
    </div>
  );
}
