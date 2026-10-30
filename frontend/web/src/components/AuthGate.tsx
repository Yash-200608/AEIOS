import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Access = 'checking' | 'allowed' | 'denied';

// Login wall: the data itself is protected by row level security (only signed-in, allow-listed emails can read it);
// this component just gives people a way to sign in and explains the state they are in.
export default function AuthGate({ children }: { children: (user: { email: string; signOut: () => void }) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<Access>('checking');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAccess('checking'); return; }
    let cancelled = false;
    supabase.from('allowed_users').select('email').maybeSingle().then(({ data, error }) => {
      if (!cancelled) setAccess(!error && data ? 'allowed' : 'denied');
    });
    return () => { cancelled = true; };
  }, [session]);

  const signOut = () => { void supabase.auth.signOut(); };

  if (session === undefined) return <div className="auth-screen"><div className="auth-card"><p className="auth-note">Loading…</p></div></div>;
  if (!session) return <LoginForm />;
  if (access === 'checking') return <div className="auth-screen"><div className="auth-card"><p className="auth-note">Checking access…</p></div></div>;
  if (access === 'denied') {
    return (
      <div className="auth-screen"><div className="auth-card">
        <h1>Access pending</h1>
        <p className="auth-note"><b>{session.user.email}</b> is signed in but is not on the AEIOS allowed list yet. Ask the project owner to add this email, then reload.</p>
        <button className="auth-button" onClick={signOut}>Sign out</button>
      </div></div>
    );
  }
  return <>{children({ email: session.user.email || '', signOut })}</>;
}

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setMessage(data.session ? '' : 'Account created. Check your email to confirm the address, then sign in.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally { setBusy(false); }
  };

  const google = async () => {
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) {
      setBusy(false);
      setMessage(/provider is not enabled/i.test(error.message) ? 'Google sign-in is not switched on yet for this project.' : error.message);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div>
          <div><div className="brand-name">AEIOS<span> / SENTINEL</span></div><div className="brand-caption">ENVIRONMENTAL INTELLIGENCE</div></div></div>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-note">Private dashboard. Only approved email addresses can view data.</p>
        <button className="auth-google" type="button" onClick={google} disabled={busy}>Continue with Google</button>
        <div className="auth-or"><span>or use email</span></div>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="auth-link" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>
          {mode === 'signin' ? 'First time? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
