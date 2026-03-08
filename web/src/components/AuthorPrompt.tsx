import { useState, useEffect } from 'react';

export function AuthorPrompt() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('hearsay_author');
    if (!stored) setShow(true);
    else setName(stored);
  }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('hearsay_author', trimmed);
    setShow(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setShow(false);
  };

  if (!show) return null;

  return (
    <div className="author-prompt-overlay">
      <div className="author-prompt">
        <h3>Who are you?</h3>
        <p>Your name will appear on posts and comments you create. Stored in your browser only.</p>
        <input
          autoFocus
          placeholder="e.g. human:sarah"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="author-prompt-actions">
          <button className="btn" onClick={() => setShow(false)}>Skip</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
