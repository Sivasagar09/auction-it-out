import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { errorText, supabase } from '../lib/supabase';
import { displayName } from '../lib/useSession';
import type { Auction } from '../lib/types';
import { downloadTemplate } from '../lib/template';
import AdminPanel from '../components/AdminPanel';

const STATUS: Record<Auction['status'], string> = { setup: 'In setup', running: 'Live', paused: 'Paused', completed: 'Finished' };

export default function Home({ session }: { session: Session }) {
  const nav = useNavigate();
  const { code: inviteCode } = useParams();
  const [list, setList] = useState<Auction[] | null>(null);

  const [name, setName] = useState('');
  const [bidding, setBidding] = useState(true);
  const [myTeam, setMyTeam] = useState(`${displayName(session)}'s XI`);
  const [format, setFormat] = useState<'match' | 'series'>('match');
  const [matchCount, setMatchCount] = useState(3);
  // The series option appears once the database has the series update.
  const [seriesReady, setSeriesReady] = useState(false);
  useEffect(() => { supabase.from('matches').select('id').limit(1).then(({ error }) => setSeriesReady(!error)); }, []);
  const [createErr, setCreateErr] = useState('');

  const [code, setCode] = useState((inviteCode || '').toUpperCase());
  const [teamName, setTeamName] = useState(`${displayName(session)}'s XI`);
  const [found, setFound] = useState<{ name: string; status: string; teams: number; max_teams: number } | null>(null);
  const [joinErr, setJoinErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('auctions').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setList((data as Auction[]) || []));
  }, []);

  useEffect(() => {
    setFound(null);
    if (code.trim().length < 6) return;
    supabase.rpc('find_auction', { p_code: code }).then(({ data }) => {
      const row = (data as { name: string; status: string; teams: number; max_teams: number }[] | null)?.[0];
      setFound(row || null);
    });
  }, [code]);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setCreateErr('');
    const { data, error } = await supabase.rpc('create_auction', { p_name: name, p_team_name: bidding ? myTeam : null });
    setBusy(false);
    if (error) return setCreateErr(errorText(error));
    if (seriesReady && format === 'series') {
      const r = await supabase.rpc('set_auction_format', { p_auction: data, p_format: 'series', p_matches: matchCount });
      if (r.error) console.warn('Could not set the series', r.error.message); // can be set again in the lobby
    }
    nav(`/a/${data}`);
  }

  async function join(e: FormEvent) {
    e.preventDefault(); setBusy(true); setJoinErr('');
    const { data, error } = await supabase.rpc('join_auction', { p_code: code, p_team_name: teamName });
    setBusy(false);
    if (error) return setJoinErr(errorText(error));
    nav(`/a/${data}`);
  }

  return (
    <>
      <div className="home-grid">
        <section className={`panel card${inviteCode ? ' highlight' : ''}`}>
          <h2>Join an auction</h2>
          <form onSubmit={join} className="form-stack">
            <div className="field"><label htmlFor="code">Join code</label>
              <input id="code" className="code-input" required maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
              {found && <span className="hint">{found.name} · {found.teams} of {found.max_teams} teams joined{found.status !== 'setup' ? ' · already started' : ''}</span>}
              {!found && code.length === 6 && <span className="hint">No auction with this code yet.</span>}
            </div>
            <div className="field"><label htmlFor="team">Your team name</label>
              <input id="team" required maxLength={40} value={teamName} onChange={e => setTeamName(e.target.value)} /></div>
            {joinErr && <div className="msg bad">{joinErr}</div>}
            <button className="btn primary big-btn" disabled={busy}>Join auction</button>
          </form>
        </section>

        <section className="panel card">
          <h2>Run a new auction</h2>
          <form onSubmit={create} className="form-stack">
            <div className="field"><label htmlFor="aname">Auction name</label>
              <input id="aname" required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={format === 'series' ? 'IND vs WI ODI series' : 'Office League 2026'} /></div>
            {seriesReady && <fieldset className="format-pick compact">
              <legend className="fl">What is this auction for?</legend>
              <label className={`fopt${format === 'match' ? ' on' : ''}`}>
                <input type="radio" name="cfmt" checked={format === 'match'} onChange={() => setFormat('match')} />
                <span><b>One match</b><span className="hint">The match that's about to start.</span></span>
              </label>
              <label className={`fopt${format === 'series' ? ' on' : ''}`}>
                <input type="radio" name="cfmt" checked={format === 'series'} onChange={() => setFormat('series')} />
                <span><b>Whole series</b><span className="hint">Same squads for every match; points add up. Run it before the first match.</span></span>
              </label>
              {format === 'series' && (
                <div className="field count-field">
                  <label htmlFor="cmcount">Number of matches</label>
                  <input id="cmcount" type="number" min={2} max={30} value={matchCount} onChange={e => setMatchCount(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
                </div>
              )}
            </fieldset>}
            <label className="check"><input type="checkbox" checked={bidding} onChange={e => setBidding(e.target.checked)} /> I'm also bidding with a team</label>
            {bidding && <div className="field"><label htmlFor="myteam">Your team name</label>
              <input id="myteam" required maxLength={40} value={myTeam} onChange={e => setMyTeam(e.target.value)} /></div>}
            {createErr && <div className="msg bad">{createErr}</div>}
            <button className="btn big-btn" disabled={busy}>Create auction</button>
            <span className="hint">You'll set the rules and upload the player sheet next. Nothing is locked until you press Start. <button type="button" className="linkish" onClick={() => downloadTemplate()}>Download the player sheet template</button></span>
          </form>
        </section>
      </div>

      <section>
        <h2>Your auctions</h2>
        {list === null ? <p className="empty">Loading…</p> : list.length === 0 ? (
          <p className="empty">You haven't joined or created an auction yet.</p>
        ) : (
          <div className="auction-list">
            {list.map(a => (
              <button key={a.id} className="panel auction-row" onClick={() => nav(`/a/${a.id}`)}>
                <b>{a.name}</b>
                <span className={`pill small ${a.status === 'running' ? 'live' : ''}`}><span className="dot" />{STATUS[a.status]}</span>
                <span className="empty">Code {a.join_code}</span>
                {a.format === 'series' && <span className="tag">Series</span>}
                {a.owner_id === session.user.id && <span className="tag">Admin</span>}
              </button>
            ))}
          </div>
        )}
      </section>
      <AdminPanel myId={session.user.id} />
    </>
  );
}
