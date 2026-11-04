import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) setMsg({ kind: 'bad', text: /rate|too many/i.test(error.message) ? 'Too many reset emails were sent just now. Wait a few minutes and try again.' : errorText(error) });
      else setMsg({ kind: 'ok', text: `If ${email.trim()} has an account, we've sent it a link to set a new password. Open the email on this device and follow the link. Check spam if you don't see it within a few minutes.` });
    } else if (mode === 'in') {
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
      {mode !== 'forgot' && <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'in'} onClick={() => { setMode('in'); setMsg(null); }}>Sign in</button>
        <button role="tab" aria-selected={mode === 'up'} onClick={() => { setMode('up'); setMsg(null); }}>Create account</button>
      </div>}
      {mode === 'forgot' ? (
        <form onSubmit={submit} className="form-stack">
          <div>
            <h2 style={{ margin: '4px 0 6px' }}>Reset your password</h2>
            <span className="hint">Enter the email you signed up with. We'll email you a link to choose a new password.</span>
          </div>
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <button className="btn primary big-btn" disabled={busy}>{busy ? 'Please wait…' : 'Send reset link'}</button>
          <button type="button" className="linkish" style={{ alignSelf: 'center' }} onClick={() => { setMode('in'); setMsg(null); }}>Back to sign in</button>
        </form>
      ) : (
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
          {mode === 'up' && <span className="hint">At least 6 characters.</span>}
          {mode === 'in' && <button type="button" className="linkish" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => { setMode('forgot'); setMsg(null); }}>Forgot password?</button>}</div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button className="btn primary big-btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      )}
    </section>
  );
}

/** Shown after someone opens the reset link from their email: choose a new password. */
export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) { setMsg({ kind: 'bad', text: "The two passwords don't match." }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg({ kind: 'bad', text: /same/i.test(error.message) ? 'Choose a password different from your old one.' : errorText(error) });
    else setSaved(true);
  }

  return (
    <section className="panel card narrow">
      <h2 style={{ marginTop: 4 }}>Choose a new password</h2>
      {saved ? (
        <div className="form-stack">
          <div className="msg ok">Your password is changed. Use it next time you sign in.</div>
          <button className="btn primary big-btn" onClick={onDone}>Go to my auctions</button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <div className="field"><label htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            <span className="hint">At least 6 characters.</span></div>
          <div className="field"><label htmlFor="new-pw2">Type it again</label>
            <input id="new-pw2" type="password" required minLength={6} value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" /></div>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <button className="btn primary big-btn" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </section>
  );
}
