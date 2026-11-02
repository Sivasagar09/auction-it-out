import { useEffect, useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { rulesOf } from '../lib/points';
import { fmt, ROLE } from '../lib/rules';
import type { Auction, CaptainPick, CaptainStatus, CaptainWindow, Match, Player, Team } from '../lib/types';
import './scorecard.css';
import './captains.css';

const when = (s: string) => new Date(s).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function left(ms: number) {
  if (ms <= 0) return 'closed';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d} day${d > 1 ? 's' : ''} ${h % 24} h left`;
  if (h >= 1) return `${h} h ${m % 60} min left`;
  if (m >= 1) return `${m} min left`;
  return `${Math.ceil(ms / 1000)} s left`;
}
/** "2026-11-02T18:30" for a datetime-local input, in the viewer's time. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export interface CaptainProps {
  a: Auction; isOwner: boolean; myTeam: Team | null; teams: Team[]; players: Player[]; matches: Match[];
  windows: CaptainWindow[]; picks: CaptainPick[]; status: CaptainStatus[]; now: number; onSaved: () => void;
}

/** Matches a window covers, e.g. "Matches 1–5" or "All matches". */
function rangeText(w: CaptainWindow, windows: CaptainWindow[], matches: Match[]) {
  const next = windows.filter(x => x.from_match_no > w.from_match_no).sort((x, y) => x.from_match_no - y.from_match_no)[0];
  const last = next ? next.from_match_no - 1 : matches.length;
  if (matches.length <= 1) return 'This match';
  if (w.from_match_no === 1 && !next) return 'Every match in the series';
  const t = (n: number) => matches.find(m => m.match_no === n)?.title ?? `Match ${n}`;
  return w.from_match_no === last ? t(last) : `${t(w.from_match_no)} to ${t(last)}`;
}

/** The pick window still open that my team hasn't picked in (for the reminder banner). */
export function openPickFor(windows: CaptainWindow[], status: CaptainStatus[], myTeam: Team | null, now: number) {
  if (!myTeam) return null;
  return windows.find(w => new Date(w.deadline).getTime() > now && !status.some(s => s.window_id === w.id && s.team_id === myTeam.id)) ?? null;
}

export function CaptainReminder({ w, now, onOpen }: { w: CaptainWindow; now: number; onOpen: () => void }) {
  return (
    <div className="cap-reminder panel">
      <span><b>Pick your captain and vice-captain</b> by {when(w.deadline)} ({left(new Date(w.deadline).getTime() - now)}).</span>
      <button className="btn primary" onClick={onOpen}>Pick now</button>
    </div>
  );
}

export default function Captains(props: CaptainProps) {
  const { a, isOwner, myTeam, teams, players, matches, windows, picks, status, now } = props;
  const r = rulesOf(a.points_rules);
  const sorted = windows.slice().sort((x, y) => x.from_match_no - y.from_match_no);
  const penalty = r.missed_pick;

  return (
    <section className="panel card captains">
      <h2>Captain picks</h2>
      <p className="empty" style={{ margin: 0 }}>
        Each team picks a <b>captain ({r.captain}× points)</b> and a <b>vice-captain ({r.vice}× points)</b> from its own squad before the deadline, and can change them until then.
        Other teams see your picks only when the deadline passes. If a team doesn't pick in time, its most expensive player becomes captain and the next most expensive vice-captain
        {penalty ? <>, and the team loses <b>{Math.abs(penalty)} points</b></> : ''}.
      </p>
      {isOwner && <AdminWindow {...props} />}
      {!sorted.length && <p className="empty">{isOwner ? 'Set a deadline above to open the picks.' : 'The admin hasn’t opened the picks yet.'}</p>}
      {sorted.map(w => (
        <WindowCard key={w.id} w={w} range={rangeText(w, sorted, matches)} {...props}
          myPick={myTeam ? picks.find(p => p.window_id === w.id && p.team_id === myTeam.id) ?? null : null}
          teamsPicked={new Set(status.filter(s => s.window_id === w.id).map(s => s.team_id))}
          allPicks={picks.filter(p => p.window_id === w.id)} squad={myTeam ? players.filter(p => p.sold_to === myTeam.id) : []}
          teams={teams} now={now} />
      ))}
    </section>
  );
}

function AdminWindow({ a, matches, windows, onSaved }: CaptainProps) {
  const series = matches.length > 1;
  const used = new Set(windows.map(w => w.from_match_no));
  const nextFrom = !used.has(1) ? 1 : (matches.find(m => m.status !== 'done' && !used.has(m.match_no))?.match_no ?? 1);
  const [from, setFrom] = useState(nextFrom);
  const existing = windows.find(w => w.from_match_no === from);
  const firstMatchDay = matches.find(m => m.match_no === from)?.starts_on;
  const [dl, setDl] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(windows.length === 0);
  useEffect(() => { setFrom(nextFrom); }, [windows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (existing) setDl(toLocalInput(new Date(existing.deadline)));
    else if (firstMatchDay) setDl(`${firstMatchDay}T12:00`);
    else { const d = new Date(Date.now() + 864e5); d.setHours(18, 0, 0, 0); setDl(toLocalInput(d)); }
  }, [from, existing?.deadline, firstMatchDay]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!dl) return setMsg({ kind: 'bad', text: 'Choose a deadline.' });
    const when = new Date(dl);
    if (!existing && when.getTime() < Date.now()) return setMsg({ kind: 'bad', text: 'That time has already passed. Choose a later deadline.' });
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('set_captain_window', { p_auction: a.id, p_from_match: from, p_deadline: when.toISOString() });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: errorText(error) });
    setMsg({ kind: 'ok', text: existing ? 'Deadline updated. Everyone sees the new time.' : 'Picks are open. A note went to the chat; you can also share it on WhatsApp below.' });
    setShow(false); onSaved();
  }

  if (!show) {
    return (
      <div className="row-inline">
        <button className="btn" onClick={() => { setShow(true); setMsg(null); }}>{series ? 'Change a deadline, or open new picks after a mid auction' : 'Change the deadline'}</button>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </div>
    );
  }
  return (
    <div className="cap-admin">
      <div className="row-between"><div className="label">Admin: {existing ? 'change a deadline' : 'open the picks'}</div>{windows.length > 0 && <button className="linkish" onClick={() => setShow(false)}>Close</button>}</div>
      <div className="cap-admin-row">
        {series && (
          <div className="field"><label htmlFor="cap-from">Picks count from</label>
            <select id="cap-from" value={from} onChange={e => { setFrom(Number(e.target.value)); setMsg(null); }}>
              {matches.map(m => <option key={m.id} value={m.match_no}>{m.match_no === 1 ? `${m.title} (start of the series)` : `${m.title} (after a mid auction)`}{used.has(m.match_no) ? ' · open' : ''}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label htmlFor="cap-dl">Deadline</label>
          <input id="cap-dl" type="datetime-local" value={dl} onChange={e => { setDl(e.target.value); setMsg(null); }} />
        </div>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : existing ? 'Save new deadline' : 'Open picks'}</button>
      </div>
      <span className="hint">{series ? 'Use the start of the series first. After a mid auction, open new picks from the first match after it; earlier matches keep the old picks. ' : ''}Moving a deadline later re-opens picking for teams that missed it.</span>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

function WindowCard({ a, w, range, isOwner, myTeam, myPick, squad, teams, players, teamsPicked, allPicks, now, onSaved }: CaptainProps & {
  w: CaptainWindow; range: string; myPick: CaptainPick | null; squad: Player[]; teamsPicked: Set<string>; allPicks: CaptainPick[];
}) {
  const ends = new Date(w.deadline).getTime();
  const open = ends > now;
  const [c, setC] = useState(myPick?.captain_id ?? '');
  const [v, setV] = useState(myPick?.vice_id ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setC(myPick?.captain_id ?? ''); setV(myPick?.vice_id ?? ''); }, [myPick?.captain_id, myPick?.vice_id]);
  const name = (id: string | null) => players.find(p => p.id === id)?.name ?? '–';
  const byPrice = squad.slice().sort((x, y) => (y.sold_price ?? 0) - (x.sold_price ?? 0));
  const changed = c !== (myPick?.captain_id ?? '') || v !== (myPick?.vice_id ?? '');
  const waiting = teams.filter(t => !teamsPicked.has(t.id));

  async function save() {
    if (!c || !v) return setMsg({ kind: 'bad', text: 'Choose both a captain and a vice-captain.' });
    if (c === v) return setMsg({ kind: 'bad', text: 'The captain and vice-captain must be different players.' });
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('pick_captains', { p_window: w.id, p_captain: c, p_vice: v });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: errorText(error) });
    setMsg({ kind: 'ok', text: `Saved: ${name(c)} is captain and ${name(v)} vice-captain. You can change them until the deadline.` });
    onSaved();
  }
  async function remove() {
    if (!window.confirm('Remove this pick round? Picks made in it are deleted and the leaderboard stops using them.')) return;
    const { error } = await supabase.rpc('delete_captain_window', { p_window: w.id });
    if (error) setMsg({ kind: 'bad', text: errorText(error) }); else onSaved();
  }
  const share = `🏏 ${a.name}: pick your captain (2×) and vice-captain (1.5×) for ${range.toLowerCase().startsWith('every') ? 'the series' : range} by ${when(w.deadline)}.\n\nMiss it and your most expensive player is made captain.\n\nPick here: ${window.location.origin}/a/${a.id}`;

  return (
    <div className={`cap-window${open ? ' is-open' : ''}`}>
      <div className="row-between">
        <div>
          <b>{range}</b>
          <span className="empty block">Deadline {when(w.deadline)} · {open ? <b className="cap-left">{left(ends - now)}</b> : 'picks locked'}</span>
        </div>
        <div className="row-inline">
          {open && <span className="tag">{teamsPicked.size} of {teams.length} picked</span>}
          {isOwner && open && <a className="btn wa-btn" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>}
          {isOwner && <button className="linkish" onClick={remove}>Remove</button>}
        </div>
      </div>

      {open && myTeam && (
        squad.length < 2 ? <p className="empty">Your squad needs at least two players to pick a captain and vice-captain.</p> : (
          <div className="cap-pick">
            <div className="field"><label htmlFor={`c-${w.id}`}>Captain ({rulesOf(a.points_rules).captain}×)</label>
              <select id={`c-${w.id}`} value={c} onChange={e => { setC(e.target.value); if (e.target.value === v) setV(''); setMsg(null); }}>
                <option value="">Choose…</option>
                {byPrice.map(p => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role]} · {fmt(p.sold_price)}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor={`v-${w.id}`}>Vice-captain ({rulesOf(a.points_rules).vice}×)</label>
              <select id={`v-${w.id}`} value={v} onChange={e => { setV(e.target.value); setMsg(null); }}>
                <option value="">Choose…</option>
                {byPrice.filter(p => p.id !== c).map(p => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role]} · {fmt(p.sold_price)}</option>)}
              </select>
            </div>
            <button className="btn go" disabled={busy || !changed} onClick={save}>{busy ? 'Saving…' : myPick ? (changed ? 'Save changes' : 'Picks saved') : 'Confirm picks'}</button>
            {myPick && !changed && !msg && <span className="hint">Your picks are saved and hidden from other teams until the deadline.</span>}
          </div>
        )
      )}

      <ul className="cap-teams">
        {teams.map(t => {
          const p = allPicks.find(x => x.team_id === t.id);
          const mine = t.id === myTeam?.id;
          return (
            <li key={t.id}>
              <span className="swatch" style={{ background: t.color }} />
              <b>{t.name}{mine ? ' (you)' : ''}</b>
              {open || !p ? (
                <span className={teamsPicked.has(t.id) ? 'cap-ok' : 'empty'}>
                  {teamsPicked.has(t.id) ? (mine && p ? `✓ ${name(p.captain_id)} (C), ${name(p.vice_id)} (VC)` : '✓ Picked') : open ? 'Not picked yet' : 'No squad'}
                </span>
              ) : (
                <span>
                  <span className="cbadge">C</span> {name(p.captain_id)} <span className="cbadge vc">VC</span> {name(p.vice_id)}
                  {p.auto && <span className="tag warn-tag">Missed deadline: picked by price</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {open && waiting.length > 0 && <span className="hint">Still to pick: {waiting.map(t => t.name).join(', ')}.</span>}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}
