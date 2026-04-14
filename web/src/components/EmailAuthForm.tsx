import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  callbackURL?: string;
  onSuccess?: () => void;
}

export function EmailAuthForm({ callbackURL, onSuccess }: Props) {
  const { signInEmail, signUpEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = mode === 'signin'
      ? await signInEmail(email, password, callbackURL)
      : await signUpEmail(name, email, password, callbackURL);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSuccess?.();
  };

  return (
    <form className="email-auth-form" onSubmit={handleSubmit}>
      {mode === 'signup' && (
        <input
          className="email-auth-input"
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />
      )}
      <input
        className="email-auth-input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <input
        className="email-auth-input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
      />
      {error && <div className="email-auth-error">{error}</div>}
      <button className="email-auth-submit" type="submit" disabled={submitting}>
        {submitting ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      <button
        className="email-auth-toggle"
        type="button"
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
