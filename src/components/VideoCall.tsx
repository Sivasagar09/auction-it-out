import { useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import type { Auction } from '../lib/types';
import './video-call.css';

const isPhone = () => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;

/** Opens the call in its own window docked to the right edge of the screen, so the auction stays visible. */
export function openCall(url: string) {
  if (isPhone()) { window.open(url, '_blank', 'noopener'); return; }
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  const w = Math.max(420, Math.min(640, Math.round(s.availWidth * 0.38)));
  const h = s.availHeight;
  const left = (s.availLeft ?? 0) + s.availWidth - w;
  const top = s.availTop ?? 0;
  const win = window.open(url, 'auction-video', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  if (!win) window.open(url, '_blank', 'noopener'); // popup blocked: fall back to a new tab
  else win.focus();
}

function host(url: string) {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('meet.google.com')) return 'Google Meet';
    if (h.endsWith('zoom.us')) return 'Zoom';
    if (h.includes('teams.')) return 'Microsoft Teams';
    return h;
  } catch { return 'video call'; }
}

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const whenText = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function inviteText(a: Auction) {
  const lines = [
    `You're invited to the player auction "${a.name}"`,
    a.starts_at ? `When: ${whenText(a.starts_at)}` : '',
    `1. Join the auction: ${window.location.origin}/join/${a.join_code} (join code ${a.join_code})`,
    a.meet_url ? `2. Join the video call: ${a.meet_url}` : '',
    'Keep both open: bid in the auction, talk on the call.',
  ];
  return lines.filter(Boolean).join('\n');
}

function calendarLink(a: Auction) {
  if (!a.starts_at) return '';
  const start = new Date(a.starts_at);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Auction: ${a.name}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: inviteText(a),
    location: a.meet_url || '',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Video call bar: join the call beside the auction, share an invite, and (admin) set the link. */
export default function VideoCall({ a, isOwner, onSaved, compact = false }: { a: Auction; isOwner: boolean; onSaved: () => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(a.meet_url || '');
  const [when, setWhen] = useState(toLocalInput(a.starts_at));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  if (a.meet_url === undefined) return null; // database not updated yet
  if (!a.meet_url && !isOwner) return null;

  function startEdit() { setUrl(a.meet_url || ''); setWhen(toLocalInput(a.starts_at)); setErr(''); setEditing(true); }

  async function save(remove = false) {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('set_auction_call', {
      p_auction: a.id,
      p_meet_url: remove ? '' : url,
      p_starts_at: remove ? a.starts_at : (when ? new Date(when).toISOString() : null),
    });
    setBusy(false);
    if (error) { setErr(errorText(error)); return; }
    setEditing(false);
    onSaved();
  }

  async function copyInvite() {
    const text = inviteText(a);
    try { await navigator.clipboard.writeText(text); setNote('Invite copied. Paste it in your group.'); }
    catch { setNote(text); }
  }

  const editor = (
    <div className="call-edit">
      <ol className="call-steps">
        <li>
          <button type="button" className="btn" onClick={() => window.open('https://meet.new', '_blank', 'noopener')}>Create a Google Meet</button>
          <span className="hint">Opens a new meeting in a new tab (you need to be signed in to Google). Copy its link, which looks like meet.google.com/abc-defg-hij.</span>
        </li>
        <li className="field">
          <label htmlFor="meet-url">Paste the meeting link</label>
          <input id="meet-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" inputMode="url" autoComplete="off" />
          <span className="hint">A Zoom or Teams link works too.</span>
        </li>
        <li className="field">
          <label htmlFor="meet-when">Start time (optional, for the calendar invite)</label>
          <input id="meet-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
        </li>
      </ol>
      {err && <div className="msg bad">{err}</div>}
      <div className="call-actions">
        <button className="btn primary" disabled={busy || !url.trim()} onClick={() => save()}>Save video call</button>
        {a.meet_url && <button className="btn" disabled={busy} onClick={() => save(true)}>Remove link</button>}
        <button className="btn" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );

  const cal = a.meet_url ? calendarLink(a) : '';
  const invite = (
        <div className="call-invite">
          <pre className="invite-text">{inviteText(a)}</pre>
          <div className="call-actions">
            <button className="btn" onClick={copyInvite}>Copy invite</button>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(inviteText(a))}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            {cal
              ? <a className="btn" href={cal} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
              : isOwner && <span className="hint">Set a start time to get a calendar invite.</span>}
          </div>
          {note && <span className="hint">{note}</span>}
        </div>
  );

  // During the auction: a slim button row in the tab bar, with pop-overs, so bidding stays in view.
  if (compact) {
    return (
      <div className="call-compact">
        {a.meet_url
          ? <button className="btn call-join small" onClick={() => openCall(a.meet_url!)}>🎥 Join video call</button>
          : <button className="btn small" onClick={() => (editing ? setEditing(false) : startEdit())}>🎥 Add video call</button>}
        {a.meet_url && <button className="btn small" aria-expanded={showInvite} onClick={() => { setShowInvite(v => !v); setEditing(false); setNote(''); }}>Invite</button>}
        {a.meet_url && isOwner && <button className="btn small" aria-expanded={editing} onClick={() => { setShowInvite(false); editing ? setEditing(false) : startEdit(); }}>Change</button>}
        {(showInvite || editing) && (
          <div className="call-pop panel">
            {showInvite && invite}
            {editing && editor}
          </div>
        )}
      </div>
    );
  }

  if (!a.meet_url) {
    return (
      <section className="panel call-bar" aria-label="Video call">
        <div className="call-row">
          <span className="call-icon" aria-hidden="true">🎥</span>
          <div className="call-text"><b>Add a video call</b><span className="hint">Let everyone see and hear each other while they bid. Only you (the admin) see this.</span></div>
          {!editing && <button className="btn" onClick={startEdit}>Set up video call</button>}
        </div>
        {editing && editor}
      </section>
    );
  }

  return (
    <section className="panel call-bar on" aria-label="Video call">
      <div className="call-row">
        <span className="call-icon" aria-hidden="true">🎥</span>
        <div className="call-text">
          <b>Video call on {host(a.meet_url)}</b>
          <span className="hint">{a.starts_at ? `Starts ${whenText(a.starts_at)} · ` : ''}Opens beside the auction, so you can watch and bid at the same time.</span>
        </div>
        <div className="call-actions">
          <button className="btn call-join" onClick={() => openCall(a.meet_url!)}>Join video call</button>
          <button className="btn" aria-expanded={showInvite} onClick={() => { setShowInvite(v => !v); setNote(''); }}>Invite</button>
          {isOwner && !editing && <button className="btn" onClick={startEdit}>Change</button>}
        </div>
      </div>
      {showInvite && invite}
      <details className="call-tips">
        <summary>How to see the video and the auction together</summary>
        <ul>
          <li><b>Laptop:</b> "Join video call" opens Meet in a narrow window on the right. Keep this auction tab on the left. In Meet you can also use ⋮ → "Open picture-in-picture" to float the faces over the auction.</li>
          <li><b>Phone:</b> join from the Meet app, then switch back to this page. Meet keeps playing in a small floating window.</li>
          <li>Bids only count when you press <b>Bid</b> here. Raising a hand on camera doesn't place a bid.</li>
          <li>Mute your mic when you're not talking, so the commentary and the call don't echo.</li>
        </ul>
      </details>
      {editing && editor}
    </section>
  );
}
