import { useEffect, useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import type { Auction, Match } from '../lib/types';
import './series.css';

export const isSeries = (a: Auction, matches: Match[]) => a.format === 'series' && matches.length > 1;

const today = () => new Date().toISOString().slice(0, 10);
export const dateText = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

/** Row of match buttons: optional "Series total", then each match (✓ when finished). */
export function MatchPicker({ matches, value, onChange, withTotal, hasScores }: {
  matches: Match[]; value: string; onChange: (id: string) => void; withTotal?: boolean; hasScores?: (id: string) => boolean;
}) {
  return (
    <div className="match-pills" role="tablist" aria-label="Matches">
      {withTotal && <button role="tab" aria-selected={value === 'all'} className="mpill total" onClick={() => onChange('all')}>Series total</button>}
      {matches.map(m => (
        <button key={m.id} role="tab" aria-selected={value === m.id}
          className={`mpill${m.status === 'done' ? ' finished' : ''}${hasScores && !hasScores(m.id) ? ' empty-m' : ''}`}
          onClick={() => onChange(m.id)}>
          {m.status === 'done' && <span aria-hidden="true">✓ </span>}{m.title}
          {m.starts_on && <small>{dateText(m.starts_on)}</small>}
        </button>
      ))}
    </div>
  );
}

/** Lobby panel: one match or the whole series, and the list of matches. */
export function SeriesSetup({ a, matches, isOwner, onSaved }: { a: Auction; matches: Match[]; isOwner: boolean; onSaved: () => void }) {
  const series = a.format === 'series';
  const [format, setFormat] = useState<'match' | 'series'>(series ? 'series' : 'match');
  const [count, setCount] = useState(series ? matches.length : 3);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFormat(a.format === 'series' ? 'series' : 'match'); if (a.format === 'series') setCount(matches.length); }, [a.format, matches.length]);

  if (a.format === undefined || !matches.length) return null; // database not updated yet
  const canEdit = isOwner && a.status === 'setup';
  const changed = format !== (series ? 'series' : 'match') || (format === 'series' && count !== matches.length);
  const past = series ? matches.filter(m => m.starts_on && m.starts_on < today()) : [];

  async function saveFormat() {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('set_auction_format', { p_auction: a.id, p_format: format, p_matches: format === 'series' ? count : 1 });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onSaved();
  }

  return (
    <section className="panel card series-setup">
      <div className="row-between">
        <h2>{series ? 'Series auction' : 'Single-match auction'}</h2>
        {!isOwner && <span className="tag">Set by the admin</span>}
      </div>
      <p className="empty" style={{ margin: 0 }}>
        {series
          ? `Teams keep the squads they buy for all ${matches.length} matches. Points from every match are added up, and the series leaderboard decides the winner.`
          : 'Points come from one match. Choose "Whole series" to keep the same squads for several matches and add the points up.'}
      </p>

      {canEdit && (
        <div className="format-pick">
          <label className={`fopt${format === 'match' ? ' on' : ''}`}>
            <input type="radio" name="fmt" checked={format === 'match'} onChange={() => setFormat('match')} />
            <span><b>One match</b><span className="hint">For the match that's about to start.</span></span>
          </label>
          <label className={`fopt${format === 'series' ? ' on' : ''}`}>
            <input type="radio" name="fmt" checked={format === 'series'} onChange={() => setFormat('series')} />
            <span><b>Whole series</b><span className="hint">Run the auction before the first match. Points add up across every match.</span></span>
          </label>
          {format === 'series' && (
            <div className="field count-field">
              <label htmlFor="mcount">Number of matches</label>
              <input id="mcount" type="number" min={2} max={30} value={count} onChange={e => setCount(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
            </div>
          )}
          <div className="row-inline">
            <button className="btn primary" disabled={busy || !changed} onClick={saveFormat}>{busy ? 'Saving…' : changed ? 'Save format' : 'Saved'}</button>
          </div>
        </div>
      )}
      {err && <div className="msg bad">{err}</div>}

      {series && (
        <>
          <ol className="match-list">
            {matches.map(m => <MatchRow key={m.id} m={m} canEdit={isOwner} onSaved={onSaved} />)}
          </ol>
          {past.length > 0 && a.status === 'setup' && (
            <div className="msg bad">{past[0].title} was on {dateText(past[0].starts_on)}. A series auction should finish before the first match starts, so every team has its squad in time.</div>
          )}
          {isOwner && <span className="hint">Name each match and add its date, for example "1st ODI, 21 Oct". You can change these at any time.</span>}
        </>
      )}
    </section>
  );
}

function MatchRow({ m, canEdit, onSaved }: { m: Match; canEdit: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(m.title);
  const [date, setDate] = useState(m.starts_on ?? '');
  const [err, setErr] = useState('');
  useEffect(() => { setTitle(m.title); setDate(m.starts_on ?? ''); }, [m.title, m.starts_on]);
  const dirty = title.trim() !== m.title || (date || null) !== (m.starts_on || null);

  async function save() {
    setErr('');
    const { error } = await supabase.rpc('save_match', { p_match: m.id, p_title: title, p_starts_on: date || null, p_done: m.status === 'done' });
    if (error) setErr(errorText(error)); else onSaved();
  }
  if (!canEdit) {
    return <li><b>{m.title}</b>{m.starts_on && <span className="empty"> · {dateText(m.starts_on)}</span>}{m.status === 'done' && <span className="tag ok-tag">Finished</span>}</li>;
  }
  return (
    <li>
      <div className="mrow">
        <input aria-label={`Name of match ${m.match_no}`} value={title} maxLength={60} onChange={e => setTitle(e.target.value)} />
        <input aria-label={`Date of ${m.title}`} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button className="btn" disabled={!dirty} onClick={save}>{dirty ? 'Save' : 'Saved'}</button>
      </div>
      {err && <div className="msg bad">{err}</div>}
    </li>
  );
}

/** Score-entry header for one match: name, date, finished. Admin only. */
export function MatchDetails({ a, m, count, hasScores, onSaved }: { a: Auction; m: Match; count: number; hasScores: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(m.title);
  const [date, setDate] = useState(m.starts_on ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(m.title); setDate(m.starts_on ?? ''); setErr(''); }, [m.id, m.title, m.starts_on]);
  const dirty = title.trim() !== m.title || (date || null) !== (m.starts_on || null);

  async function save(done: boolean) {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('save_match', { p_match: m.id, p_title: title, p_starts_on: date || null, p_done: done });
    setBusy(false);
    if (error) setErr(errorText(error)); else onSaved();
  }
  async function resize(n: number) {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('set_auction_format', { p_auction: a.id, p_format: 'series', p_matches: n });
    setBusy(false);
    if (error) setErr(errorText(error)); else onSaved();
  }

  return (
    <div className="match-details">
      <div className="mrow">
        <input aria-label="Match name" value={title} maxLength={60} onChange={e => setTitle(e.target.value)} />
        <input aria-label="Match date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        {dirty && <button className="btn" disabled={busy} onClick={() => save(m.status === 'done')}>Save name and date</button>}
      </div>
      <div className="row-inline">
        {m.status === 'done'
          ? <><span className="tag ok-tag">✓ Finished</span><button className="linkish" disabled={busy} onClick={() => save(false)}>Reopen this match</button></>
          : <button className="btn" disabled={busy || !hasScores} onClick={() => save(true)} title={hasScores ? '' : 'Enter scores first'}>Mark {m.title} as finished</button>}
        <span className="hint">{m.status === 'done' ? 'Its points count in the series total. You can still correct figures.' : 'Mark it finished once the scorecard is final. The series result is final when every match is finished.'}</span>
      </div>
      <div className="row-inline series-size">
        <span className="hint">{count} matches in this series.</span>
        <button className="linkish" disabled={busy} onClick={() => resize(count + 1)}>Add a match</button>
        {count > 2 && <button className="linkish" disabled={busy} onClick={() => resize(count - 1)}>Remove the last match</button>}
      </div>
      {err && <div className="msg bad">{err}</div>}
    </div>
  );
}
