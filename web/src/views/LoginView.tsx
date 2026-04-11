import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { GitHubIcon, GoogleIcon } from '../components/ProviderIcons';

export function LoginView() {
  const { user, account, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const callbackURL = params.get('callbackURL') || '/';

  useEffect(() => {
    if (loading) return;
    if (user && account) navigate('/projects');
    else if (user && !account) navigate('/onboarding');
  }, [user, account, loading]);

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Sign in to Kilroy</h1>
        </div>
        <div className="login-buttons">
          <button className="login-btn login-btn-github" onClick={() => signIn('github', callbackURL)}>
            <span className="login-btn-icon"><GitHubIcon /></span>
            Continue with GitHub
          </button>
          <button className="login-btn login-btn-google" onClick={() => signIn('google', callbackURL)}>
            <span className="login-btn-icon"><GoogleIcon /></span>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
