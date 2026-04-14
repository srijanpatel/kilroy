import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { GitHubIcon, GoogleIcon } from '../components/ProviderIcons';
import { EmailAuthForm } from '../components/EmailAuthForm';

export function LoginView() {
  const { user, account, loading, signIn, config } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const callbackURL = params.get('callbackURL') || '/';

  useEffect(() => {
    if (loading) return;
    if (user && account) {
      const joinReturnTo = sessionStorage.getItem('joinReturnTo');
      if (joinReturnTo) {
        sessionStorage.removeItem('joinReturnTo');
        navigate(joinReturnTo);
        return;
      }
      navigate('/projects');
      return;
    }
    if (user && !account) navigate('/onboarding');
  }, [user, account, loading]);

  if (loading) return null;

  const hasGithub = config?.providers.includes('github');
  const hasGoogle = config?.providers.includes('google');
  const hasSocial = hasGithub || hasGoogle;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Sign in to Kilroy</h1>
        </div>
        <div className="login-buttons">
          {hasGithub && (
            <button className="login-btn login-btn-github" onClick={() => signIn('github', callbackURL)}>
              <span className="login-btn-icon"><GitHubIcon /></span>
              Continue with GitHub
            </button>
          )}
          {hasGoogle && (
            <button className="login-btn login-btn-google" onClick={() => signIn('google', callbackURL)}>
              <span className="login-btn-icon"><GoogleIcon /></span>
              Continue with Google
            </button>
          )}
          {config?.emailPassword && hasSocial && (
            <div className="login-divider">or</div>
          )}
          {config?.emailPassword && (
            <EmailAuthForm callbackURL={callbackURL} />
          )}
        </div>
      </div>
    </div>
  );
}
