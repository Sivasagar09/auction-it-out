import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { fmt, maxBidFor, missingRoles, nextBid, roleCounts, ROLE, squadOf, stepFor, whyNot } from '../lib/rules';
import type { Auction, Player, Team } from '../lib/types';
import type { AuctionState } from '../lib/useAuction';
import Avatar from './Avatar';

type Props = AuctionState & { auction: Auction; isOwner: boolean; myTeam: Team | null; userId: string };

const CIRC = 2 * Math.PI * 42;

export default function Room(props: Props) {
  const { auction: a, teams, players, bids, now, isOwner, myTeam, reload } = props;
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [adminErr, setAdminErr] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const team = (id: string | null) => teams.find(t => t.id === id);
  const current = players.find(p => p.id === a.current_player_id) || null;
  const upcoming = players.find(p => p.status === 'pool') || null;
  const leader = team(a.leader_team_id);
  const amount = nextBid(a);
  const reason = myTeam ? whyNot(a, myTeam, players) : 'no-team';
  const canBid = !!myTeam && !reason && !pending;

  const say = (text: string) => { setFlash(text); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 3500); };

  const bid = useCallback(async () => {
    if (!canBid || amount == null) return;
    setPending(true);
    const { error } = await supabase.rpc('place_bid', { p_auction: a.id, p_expected: amount });
    setPending(false);
    if (error) say(errorText(error));
    reload();
  }, [canBid, amount, a.id, reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'b' || e.key === 'B') && !(e.target as HTMLElement).closest('input,select,textarea')) { e.preventDefault(); bid(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bid]);

  async function admin(fn: string) {
    setAdminErr('');
    const { error } = await supabase.rpc(fn, { p_auction: a.id });
    setConfirmReset(false); setConfirmEnd(false);
    if (error) setAdminErr(errorText(error)); else reload();
  }
  async function unskip(id: string) {
    setAdminErr('');
    const { error } = await supabase.rpc('unskip_player', { p_player: id });
    if (error) setAdminErr(errorText(error)); else reload();
  }

  // ----- Clock -----
  const ends = a.phase_ends_at ? new Date(a.phase_ends_at).getTime() : now;
  const left = a.status === 'paused' ? a.paused_remaining_ms ?? 0 : Math.max(0, ends - now);
  const total = a.phase === 'live' ? a.timer_seconds * 1000 : a.phase === 'gap' ? 5000 : 4000;
  const frac = Math.min(1, left / total);
  const low = a.phase === 'live' && left < 4000;

  const done = players.filter(p => p.status === 'sold' || p.status === 'unsold' || p.status === 'skipped').length;
  const canSkip = (a.status === 'running' || a.status === 'paused') && (a.phase === 'live' ? !!current : !!upcoming);
  const shown = a.phase === 'gap' ? upcoming : current;
  const statusText = a.status === 'paused' ? 'Paused' : a.status === 'completed' ? 'Finished' : a.phase === 'live' ? 'Live' : a.phase === 'result' ? 'Hammer down' : 'Next player';

  return (
    <>
      <div className="room-head">
        <div>
          <span className="label">{a.name} · code {a.join_code}</span>
          <div className="row-inline">
            <span className={`pill ${a.status === 'running' && a.phase === 'live' ? 'live' : a.status === 'paused' ? 'paused' : ''}`}><span className="dot" />{statusText}</span>
            <span className="empty">{a.timer_seconds}s bid timer · runs automatically</span>
          </div>
        </div>
        {isOwner && (
          <div className="admin-bar">
            {a.status === 'running' && <button className="btn" onClick={() => admin('pause_auction')}>Pause</button>}
            {a.status === 'paused' && <button className="btn primary" onClick={() => admin('resume_auction')}>Resume</button>}
            {canSkip && <button className="btn" onClick={() => admin('skip_player')} title="Take this player out without a sale">Skip {a.phase === 'live' ? current?.name : `next (${upcoming?.name})`}</button>}
            {(a.status === 'running' || a.status === 'paused') && (!confirmEnd
              ? <button className="btn" onClick={() => setConfirmEnd(true)}>End auction</button>
              : <span className="confirm">End now? A current leading bid still counts. <button className="btn danger" onClick={() => admin('end_auction')}>End auction</button><button className="btn" onClick={() => setConfirmEnd(false)}>Cancel</button></span>)}
            {!confirmReset
              ? <button className="btn" onClick={() => setConfirmReset(true)}>Reset to setup</button>
              : <span className="confirm">Clear every bid and result? <button className="btn danger" onClick={() => admin('reset_auction')}>Reset</button><button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button></span>}
            {adminErr && <span className="msg bad">{adminErr}</span>}
          </div>
        )}
      </div>

      <div className="room">
        <section className="panel stage" aria-live="polite">
          <div className="stage-head">
            <span className="label">{a.status === 'completed' ? 'All lots complete' : `${a.round > 1 ? 'Unsold round · ' : ''}Lot ${Math.min(done + (a.phase === 'result' ? 0 : 1), players.length)} of ${players.length}`}</span>
            <span className="label">{players.filter(p => p.status === 'pool').length} still to come</span>
          </div>

          {a.status === 'completed' ? (
            <Done a={a} players={players} teams={teams} isOwner={isOwner} onUnsold={() => admin('start_unsold_round')} />
          ) : shown ? (
            <div className="stage-body">
              <div className="player">
                <div className="player-top">
                  <Avatar p={shown} size={112} />
                  <div className="player-id">
                    <div className="role-row">
                      <span className="tag role">{ROLE[shown.role]}</span>
                      {shown.country && <span className="tag">{shown.country}</span>}
                      {a.phase === 'gap' && <span className="tag">Up next</span>}
                    </div>
                    <h3 className="pname">{shown.name}</h3>
                  </div>
                </div>
                {shown.stats?.length > 0 && (
                  <div className="stats">
                    {shown.stats.slice(0, 8).map((st, i) => <div className="stat" key={i}><div className="label">{st.label}</div><div className="v num">{st.value}</div></div>)}
                  </div>
                )}
                <div className="facts">
                  <div className="fact"><div className="label">Base price</div><div className="v num">{fmt(shown.base_price)}</div></div>
                  <div className="fact"><div className="label">Next raise</div><div className="v num">+{fmt(stepFor(a.increments, a.phase === 'live' && leader ? a.current_bid ?? shown.base_price : shown.base_price))}</div></div>
                </div>
              </div>
              <div className="bidside">
                <div className="bidline">
                  <div>
                    <div className="label">{a.phase === 'live' && leader ? 'Current bid' : 'Opening at'}</div>
                    <div className="amount num" key={a.bid_count}>{fmt(a.phase === 'live' ? a.current_bid : shown.base_price)}</div>
                  </div>
                  <div className={`ring${low ? ' low' : ''}${a.phase !== 'live' ? ' wait' : ''}`}>
                    <svg viewBox="0 0 96 96"><circle className="track" cx="48" cy="48" r="42" /><circle className="prog" cx="48" cy="48" r="42" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} /></svg>
                    <div className="sec num">{Math.ceil(left / 1000)}</div>
                  </div>
                </div>
                <div className="leader">
                  {a.phase === 'live' && leader
                    ? <><span className="swatch" style={{ background: leader.color }} />{leader.id === myTeam?.id ? 'You lead' : `${leader.name} leads`}</>
                    : <span className="empty">{a.phase === 'gap' ? 'Bidding opens in a moment' : 'No bids yet'}</span>}
                </div>
                {myTeam ? (
                  <>
                    <button className="bidbtn" onClick={bid} disabled={!canBid}>
                      <span className="big num">{pending ? 'Bidding…' : `Bid ${fmt(a.phase === 'live' ? amount : shown.base_price)}`}</span>
                      <span className="small">{canBid ? <>Press <span className="kbd">B</span> or tap</> : ' '}</span>
                    </button>
                    <div className={`why${flash ? ' alert' : ''}`}>{flash || (a.phase === 'live' && reason !== 'no-team' ? reason : '')}</div>
                  </>
                ) : (
                  <div className="msg">You're running this auction without a team, so you can watch but not bid.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="done"><span className="empty">Getting the next player ready…</span></div>
          )}

          {a.phase === 'result' && a.status !== 'completed' && current && (
            <div className="overlay">
              {leader ? (
                <div><div className="stamp">Sold</div>
                  <p>{current.name} to <span style={{ color: leader.color }}>{leader.id === myTeam?.id ? 'you' : leader.name}</span></p>
                  <div className="sub num">for {fmt(a.current_bid)} · {a.bid_count} bid{a.bid_count === 1 ? '' : 's'}</div></div>
              ) : (
                <div><div className="stamp unsold">Unsold</div><p>{current.name}</p><div className="sub">No bids at base price {fmt(current.base_price)}</div></div>
              )}
            </div>
          )}
          {a.status === 'paused' && (
            <div className="overlay"><div><div className="stamp unsold">Paused</div><p>The admin paused the auction</p><div className="sub">The clock continues from {Math.ceil(left / 1000)}s when it resumes.</div></div></div>
          )}
        </section>

        <aside className="side">
          {myTeam && <YourTeam a={a} team={myTeam} players={players} current={a.phase === 'live' ? current : null} />}
          <section className="panel feed">
            <div className="label">Bids on {a.phase === 'live' || a.phase === 'result' ? current?.name ?? 'this player' : 'this player'}</div>
            <ol>
              {bids.filter(b => b.player_id === a.current_player_id && (a.phase === 'live' || a.phase === 'result')).slice(0, 30).map(b => {
                const t = team(b.team_id);
                return <li key={b.id} className={t?.id === myTeam?.id ? 'mine' : ''}><span className="swatch" style={{ background: t?.color }} />{t?.id === myTeam?.id ? 'You' : t?.name}<span className="t num">{fmt(b.amount)}</span></li>;
              })}
              {!(a.phase === 'live' || a.phase === 'result') || !bids.some(b => b.player_id === a.current_player_id) ? <li className="empty">No bids yet.</li> : null}
            </ol>
            <div className="label" style={{ paddingTop: 14 }}>Recent results</div>
            <ol>
              {players.filter(p => p.status === 'sold').sort((x, y) => (y.sold_at || '').localeCompare(x.sold_at || '')).slice(0, 6).map(p => {
                const t = team(p.sold_to);
                return <li key={p.id} className={`res${t?.id === myTeam?.id ? ' mine' : ''}`}><span className="swatch" style={{ background: t?.color }} />{p.name} → {t?.id === myTeam?.id ? 'you' : t?.name}<span className="t num">{fmt(p.sold_price)}</span></li>;
              })}
              {!players.some(p => p.status === 'sold') && <li className="empty">Sold players appear here.</li>}
            </ol>
          </section>
        </aside>
      </div>

      <section>
        <h2>Teams</h2>
        <div className="teams">{teams.map(t => <TeamCard key={t.id} a={a} team={t} players={players} mine={t.id === myTeam?.id} />)}</div>
      </section>

      <Pool players={players} teams={teams} myTeam={myTeam} isOwner={isOwner} onUnskip={unskip} />
    </>
  );
}

function ReqChips({ a, team, players }: { a: Auction; team: Team; players: Player[] }) {
  const c = roleCounts(team, players);
  const n = squadOf(team, players).length;
  return (
    <div className="req">
      {a.min_bowlers > 0 && <span className={c.BOWL >= a.min_bowlers ? 'met' : 'miss'}>{c.BOWL >= a.min_bowlers ? '✓' : 'Need'} {a.min_bowlers} bowler{a.min_bowlers > 1 ? 's' : ''}</span>}
      {a.min_allrounders > 0 && <span className={c.AR >= a.min_allrounders ? 'met' : 'miss'}>{c.AR >= a.min_allrounders ? '✓' : 'Need'} {a.min_allrounders} all-rounder{a.min_allrounders > 1 ? 's' : ''}</span>}
      {a.min_squad > 0 && <span className={n >= a.min_squad ? 'met' : 'miss'}>{n >= a.min_squad ? '✓' : 'Need'} {a.min_squad} player{a.min_squad > 1 ? 's' : ''}</span>}
    </div>
  );
}

function YourTeam({ a, team, players, current }: { a: Auction; team: Team; players: Player[]; current: Player | null }) {
  const n = squadOf(team, players).length;
  return (
    <section className="panel you">
      <div className="you-head"><span className="swatch" style={{ background: team.color }} /><b>{team.name}</b><span className="tag" style={{ marginLeft: 'auto' }}>Your team</span></div>
      <div><div className="label">Purse left</div><div className="purse num">{fmt(team.purse_left)}</div></div>
      <div className="bar"><i style={{ width: `${(team.purse_left / a.purse) * 100}%` }} /></div>
      <div className="kv">
        <div><div className="label">Spent</div><div className="v num">{fmt(a.purse - team.purse_left)}</div></div>
        <div><div className="label">Squad</div><div className="v num">{n} / {a.max_squad}</div></div>
        <div><div className="label">Max bid</div><div className="v num">{fmt(maxBidFor(a, team, players, current))}</div></div>
      </div>
      <ReqChips a={a} team={team} players={players} />
      {missingRoles(a, team, players) > 0 && n >= a.max_squad - missingRoles(a, team, players) && n < a.max_squad && (
        <span className="hint warn-text">Your remaining places must go to the roles you still need.</span>
      )}
    </section>
  );
}

function TeamCard({ a, team, players, mine }: { a: Auction; team: Team; players: Player[]; mine: boolean }) {
  const squad = squadOf(team, players).sort((x, y) => (x.sold_at || '').localeCompare(y.sold_at || ''));
  return (
    <div className={`panel team${mine ? ' me' : ''}`}>
      <div className="team-top"><span className="swatch" style={{ background: team.color }} /><b>{team.name}</b><span className="n num">{squad.length}/{a.max_squad}</span></div>
      <div className="team-money"><span>Purse left <b className="num">{fmt(team.purse_left)}</b></span><span className="num">spent {fmt(a.purse - team.purse_left)}</span></div>
      <div className="bar"><i style={{ width: `${(team.purse_left / a.purse) * 100}%`, background: team.color }} /></div>
      <ReqChips a={a} team={team} players={players} />
      {squad.length ? (
        <ul className="squad">{squad.map(p => <li key={p.id}><span className="rc">{p.role}</span><span>{p.name}</span><span className="p num">{fmt(p.sold_price)}</span></li>)}</ul>
      ) : <span className="empty">No players yet</span>}
    </div>
  );
}

function Pool({ players, teams, myTeam, isOwner, onUnskip }: { players: Player[]; teams: Team[]; myTeam: Team | null; isOwner: boolean; onUnskip: (id: string) => void }) {
  const [filter, setFilter] = useState<'ALL' | Player['role']>('ALL');
  const st: Record<Player['status'], string> = { pool: 'Upcoming', live: 'On the block', sold: 'Sold', unsold: 'Unsold', skipped: 'Skipped' };
  return (
    <section>
      <div className="pool-head">
        <h2>Player pool</h2>
        <div className="filters">
          {(['ALL', 'BAT', 'BOWL', 'AR', 'WK'] as const).map(f => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'ALL' ? 'All' : ROLE[f] + 's'}</button>
          ))}
        </div>
      </div>
      <div className="panel tablewrap">
        <table>
          <thead><tr><th>Order</th><th>Player</th><th>Role</th><th className="r">Base price</th><th>Status</th><th className="r">Sold for</th><th>Team</th></tr></thead>
          <tbody>
            {players.filter(p => filter === 'ALL' || p.role === filter).map(p => {
              const t = teams.find(x => x.id === p.sold_to);
              return (
                <tr key={p.id} className={p.status === 'live' ? 'now' : ''}>
                  <td className="num">{p.order_no}</td><td><span className="who-cell"><Avatar p={p} size={28} /><b>{p.name}</b></span></td><td>{ROLE[p.role]}</td>
                  <td className="r num">{fmt(p.base_price)}</td><td><span className={`st ${p.status}`}>{st[p.status]}</span>{isOwner && p.status === 'skipped' && <> <button className="linkish" onClick={() => onUnskip(p.id)}>Bring back</button></>}</td>
                  <td className="r num">{p.sold_price ? fmt(p.sold_price) : '–'}</td>
                  <td>{t && <span className="leader small-leader"><span className="swatch" style={{ background: t.color }} />{t.id === myTeam?.id ? 'You' : t.name}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Done({ a, players, teams, isOwner, onUnsold }: { a: Auction; players: Player[]; teams: Team[]; isOwner: boolean; onUnsold: () => void }) {
  const sold = players.filter(p => p.status === 'sold').length;
  const unsoldList = players.filter(p => p.status === 'unsold');
  const uns = unsoldList.length;
  const skipped = players.filter(p => p.status === 'skipped').length;
  const cheapest = uns ? Math.min(...unsoldList.map(p => p.base_price)) : 0;
  const canStillBuy = teams.some(t => squadOf(t, players).length < a.max_squad && t.purse_left >= cheapest);
  const allFull = teams.length > 0 && teams.every(t => squadOf(t, players).length >= a.max_squad);
  return (
    <div className="done">
      <h3>Auction closed</h3>
      <div className="empty">{sold} players sold, {uns} unsold{skipped ? `, ${skipped} skipped` : ''}{a.round > 1 ? ` after ${a.round} rounds` : ''}.</div>
      {allFull && <div className="msg ok">Every team's squad is full.</div>}
      {isOwner && uns > 0 && canStillBuy && <button className="btn primary" onClick={onUnsold}>Run a round for the {uns} unsold player{uns > 1 ? 's' : ''}</button>}
      {!isOwner && uns > 0 && canStillBuy && <span className="hint">The admin can run a round for unsold players.</span>}
    </div>
  );
}
