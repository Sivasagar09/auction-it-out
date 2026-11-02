import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: 'bad', text: /invalid/i.test(error.message) ? 'Email or password is wrong.' : /confirm/i.test(error.message) ? 'Confirm your email first. Check your inbox for the link.' : errorText(error) });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.href },
      });
      if (error) setMsg({ kind: 'bad', text: errorText(error) });
      else if (!data.session) setMsg({ kind: 'ok', text: `We sent a confirmation link to ${email}. Open it, then sign in here.` });
    }
    setBusy(false);
  }

  const inviteCode = window.location.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1];

  return (
    <section className="panel card narrow">
      {inviteCode && <div className="msg ok">You've been invited to an auction (code <b>{inviteCode.toUpperCase()}</b>). Sign in or create an account to join.</div>}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'in'} onClick={() => { setMode('in'); setMsg(null); }}>Sign in</button>
        <button role="tab" aria-selected={mode === 'up'} onClick={() => { setMode('up'); setMsg(null); }}>Create account</button>
      </div>
      <form onSubmit={submit} className="form-stack">
        {mode === 'up' && (
          <div className="field"><label htmlFor="name">Your name</label>
            <input id="name" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>
        )}
        <div className="field"><label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="field"><label htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          {mode === 'up' && <span className="hint">At least 6 characters.</span>}</div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button className="btn primary big-btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
    </section>
  );
}
