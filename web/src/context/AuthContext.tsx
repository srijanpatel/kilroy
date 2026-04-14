import { createContext, useContext, useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';

interface User { id: string; email: string; name: string; }
interface Account { id: string; slug: string; display_name: string; }
interface AuthConfig {
  emailPassword: boolean;
  providers: Array<'github' | 'google'>;
}
interface AuthState {
  loading: boolean;
  user: User | null;
  account: Account | null;
  config: AuthConfig | null;
  signIn: (provider: 'github' | 'google', callbackURL?: string) => Promise<void>;
  signInEmail: (email: string, password: string, callbackURL?: string) => Promise<{ error?: string }>;
  signUpEmail: (name: string, email: string, password: string, callbackURL?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account', { credentials: 'include' });
      if (!res.ok) { setAccount(null); return; }
      const data = await res.json();
      setAccount(data.has_account ? data.account : null);
    } catch { setAccount(null); }
  };

  useEffect(() => {
    fetch('/api/auth-config')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setConfig(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setUser({ id: session.data.user.id, email: session.data.user.email!, name: session.data.user.name });
        fetchAccount().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const signIn = async (provider: 'github' | 'google', callbackURL?: string) => {
    await authClient.signIn.social({ provider, callbackURL: callbackURL || '/' });
  };

  const signInEmail = async (email: string, password: string, callbackURL?: string) => {
    const { error } = await authClient.signIn.email({ email, password, callbackURL: callbackURL || '/' });
    if (error) return { error: error.message || 'Sign in failed' };
    const session = await authClient.getSession();
    if (session?.data?.user) {
      setUser({ id: session.data.user.id, email: session.data.user.email!, name: session.data.user.name });
      await fetchAccount();
    }
    return {};
  };

  const signUpEmail = async (name: string, email: string, password: string, callbackURL?: string) => {
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: callbackURL || '/' });
    if (error) return { error: error.message || 'Sign up failed' };
    const session = await authClient.getSession();
    if (session?.data?.user) {
      setUser({ id: session.data.user.id, email: session.data.user.email!, name: session.data.user.name });
      await fetchAccount();
    }
    return {};
  };

  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
    setAccount(null);
  };

  return (
    <AuthContext.Provider value={{ loading, user, account, config, signIn, signInEmail, signUpEmail, signOut, refreshAccount: fetchAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within AuthProvider');
  return ctx;
}
