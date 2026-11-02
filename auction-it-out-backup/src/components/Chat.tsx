import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';
import type { Auction, ChatMessage, Team } from '../lib/types';

const REACTIONS = ['🔥', '👏', '😂', '😮', '😬', '💰'];

function load(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** Chat dock: a small button that opens a panel. It never blocks the auction screen. */
export default function Chat({ a, chat, teams, userId, isOwner, onSent }: {
  a: Auction; chat: ChatMessage[]; teams: Team[]; userId: string; isOwner: boolean; onSent: () => void;
}) {
  const [open, setOpen] = useState(() => load('chatOpen', window.innerWidth >= 1000 ? '1' : '0') === '1');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const seenKey = `chatSeen:${a.id}`;
  const [seen, setSeen] = useState(() => Number(load(seenKey, '0')));
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = chat.length ? chat[chat.length - 1].id : 0;
  const unread = open ? 0 : chat.filter(m => m.id > seen && m.user_id !== userId).length;
  // Chat appears only once the database has the chat functions installed.
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    const check = () => supabase.rpc('fmt_lakh', { p: 1 }).then(({ error }) => { if (alive) setReady(!error); });
    check();
    const t = setInterval(check, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [ready]);

  useEffect(() => {
    save('chatOpen', open ? '1' : '0');
    // On wide screens the page makes room for the open chat instead of being covered by it.
    document.body.classList.toggle('chat-open', open && !!ready);
    return () => document.body.classList.remove('chat-open');
  }, [open, ready]);
  useEffect(() => { if (open && lastId > seen) { setSeen(lastId); save(seenKey, String(lastId)); } }, [open, lastId, seen, seenKey]);

  // Keep the newest message in view unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.length, open]);

  async function send(body: string) {
    const msg = body.trim();
    if (!msg || busy) return;
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('post_message', { p_auction: a.id, p_body: msg });
    setBusy(false);
    if (error) { setErr(errorText(error)); return; }
    stick.current = true;
    onSent();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text;
    setText('');
    await send(body);
  }
  async function remove(m: ChatMessage) {
    const { error } = await supabase.rpc('delete_message', { p_id: m.id });
    if (error) setErr(errorText(error)); else onSent();
  }

  const color = (m: ChatMessage) => teams.find(t => t.id === m.team_id)?.color ?? 'var(--muted)';
  const time = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!ready) return null;

  if (!open) {
    return (
      <button className="chat-pill" onClick={() => setOpen(true)} aria-label={`Open chat${unread ? `, ${unread} new messages` : ''}`}>
        <span aria-hidden="true">💬</span> Chat{unread > 0 && <span className="badge num">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <section className="chat-dock panel" aria-label="Auction chat">
      <header className="chat-head">
        <b>Chat</b><span className="empty">{a.name}</span>
        <button className="btn chat-close" onClick={() => setOpen(false)} aria-label="Close chat">Hide</button>
      </header>
      <div className="chat-list" ref={listRef} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {chat.length === 0 && <p className="empty chat-empty">No messages yet. Say hello to the other teams.</p>}
        {chat.map(m => m.kind === 'system' ? (
          <div key={m.id} className="chat-sys"><span>{m.body}</span><time>{time(m.created_at)}</time></div>
        ) : (
          <div key={m.id} className={`chat-msg${m.user_id === userId ? ' mine' : ''}${/^\p{Extended_Pictographic}{1,3}$/u.test(m.body) ? ' emoji' : ''}`}>
            <div className="chat-meta">
              <span className="swatch" style={{ background: color(m) }} />
              <b>{m.user_id === userId ? 'You' : m.author}</b>
              <time>{time(m.created_at)}</time>
              {(m.user_id === userId || isOwner) && <button className="linkish chat-del" onClick={() => remove(m)} aria-label="Delete message">Delete</button>}
            </div>
            <div className="chat-body">{m.body}</div>
          </div>
        ))}
      </div>
      <div className="chat-reacts">
        {REACTIONS.map(r => <button key={r} onClick={() => send(r)} disabled={busy} aria-label={`Send ${r}`}>{r}</button>)}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input aria-label="Message" placeholder="Type a message" maxLength={500} value={text} onChange={e => setText(e.target.value)} />
        <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
      </form>
      {err && <div className="msg bad chat-err">{err}</div>}
    </section>
  );
}
