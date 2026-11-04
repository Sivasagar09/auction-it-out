import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { fmt, maxBidFor, nextBid, roleCounts, ROLE, squadOf, stepFor, whyNot } from '../lib/rules';
import type { Auction, Player, Team } from '../lib/types';
import type { AuctionState } from '../lib/useAuction';
import Avatar from './Avatar';
import './arena.css';

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
  const queue = players.filter(p => p.status === 'pool');
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
          ) : (
            <div className="arena">
              {teams.map((t, i) => {
                const st = stateOf(a, t, players);
                const isLead = st.kind === 'lead';
                return (
                  <div key={t.id} className={`seat${SEATS[i] ? ` seat-${SEATS[i]}` : ''}${isLead ? ` lead ${a.phase === 'live' ? (a.bid_count % 2 ? 'flashA' : 'flashB') : ''}` : ''}${st.kind === 'no' ? ' out' : ''}`}
                    style={{ '--seat': t.color } as CSSProperties}>
                    <div className="tile">
                      <span className="face" aria-hidden="true">{initialsOf(t.name)}</span>
                      {isLead && <span className="lead-tag num">{a.phase === 'result' ? 'Won' : 'Highest'} {fmt(a.current_bid)}</span>}
                    </div>
                    <div className="seat-name">
                      <span className="mini" aria-hidden="true">{initialsOf(t.name)}</span>
                      <span className="n">{t.name}</span>
                      {t.id === myTeam?.id && <span className="you-tag">You</span>}
                    </div>
                  </div>
                );
              })}

              <div className="centre" style={{ '--lead': leader && a.phase !== 'gap' ? leader.color : undefined } as CSSProperties}>
                {shown ? (
                  <>
                    <div className="who">
                      <Avatar p={shown} size={72} />
                      <div className="player-id">
                        <h3 className="pname">{shown.name}</h3>
                        <div className="role-row">
                          <span className="tag role">{ROLE[shown.role]}</span>
                          {shown.country && <span className="tag">{shown.country}</span>}
                          {a.phase === 'gap' && <span className="tag">Up next</span>}
                        </div>
                      </div>
                    </div>
                    <div className="bidline">
                      <div className={`ring${low ? ' low' : ''}${a.phase !== 'live' ? ' wait' : ''}`}>
                        <svg viewBox="0 0 96 96"><circle className="track" cx="48" cy="48" r="42" /><circle className="prog" cx="48" cy="48" r="42" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} /></svg>
                        <div className="sec num">{Math.ceil(left / 1000)}</div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div className="label">{a.phase === 'live' && leader ? 'Current bid' : 'Opening at'}</div>
                        <div className="amount num" key={a.bid_count}>{fmt(a.phase === 'live' ? a.current_bid : shown.base_price)}</div>
                        <div className="leader">
                          {a.phase === 'live' && leader
                            ? <><span className="swatch" style={{ background: leader.color }} />{leader.id === myTeam?.id ? 'You lead' : `${leader.name} leads`}</>
                            : <span className="empty">{a.phase === 'gap' ? 'Bidding opens in a moment' : 'No bids yet'}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="facts-row">
                      <span>Base <b className="num">{fmt(shown.base_price)}</b></span>
                      <span>Next raise <b className="num">+{fmt(stepFor(a.increments, a.phase === 'live' && leader ? a.current_bid ?? shown.base_price : shown.base_price))}</b></span>
                      {a.phase === 'live' && <span>Bids <b className="num">{a.bid_count}</b></span>}
                    </div>
                    {myTeam ? (
                      <>
                        <button className="bidbtn" onClick={bid} disabled={!canBid}>
                          <span className="big num">{pending ? 'Bidding…' : `Bid ${fmt(a.phase === 'live' ? amount : shown.base_price)}`}</span>
                          <span className="small">{canBid ? <>Press <span className="kbd">B</span> or tap</> : ' '}</span>
                        </button>
                        <div className={`why${flash ? ' alert' : ''}`}>{flash || (a.phase === 'live' && reason !== 'no-team' ? reason : '')}</div>
                      </>
                    ) : (
                      <div className="msg">You're running this auction without a team, so you can watch but not bid.</div>
                    )}
                  </>
                ) : (
                  <span className="empty" style={{ margin: 'auto' }}>Getting the next player ready…</span>
                )}

                {a.phase === 'result' && current && (
                  <div className="result">
                    {leader ? (
                      <div><div className="stamp" style={{ color: leader.color, borderColor: leader.color }}>Sold</div>
                        <p>{current.name} to <span style={{ color: leader.color }}>{leader.id === myTeam?.id ? 'you' : leader.name}</span></p>
                        <div className="sub num">for {fmt(a.current_bid)} · {a.bid_count} bid{a.bid_count === 1 ? '' : 's'}</div></div>
                    ) : (
                      <div><div className="stamp unsold">Unsold</div><p>{current.name}</p><div className="sub">No bids at base price {fmt(current.base_price)}</div></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <TeamTable a={a} teams={teams} players={players} myTeam={myTeam} current={a.phase === 'live' ? current : null} />

          {a.status === 'paused' && (
            <div className="overlay"><div><div className="stamp unsold">Paused</div><p>The admin paused the auction</p><div className="sub">The clock continues from {Math.ceil(left / 1000)}s when it resumes.</div></div></div>
          )}
        </section>

        <aside className="side">
          <section className="panel feed">
            <div className="label">Bids on {a.phase === 'live' || a.phase === 'result' ? current?.name ?? 'this player' : 'this player'}</div>
            <ol>
              {bids.filter(b => b.player_id === a.current_player_id && (a.phase === 'live' || a.phase === 'result')).slice(0, 30).map(b => {
                const t = team(b.team_id);
                return <li key={b.id} className={t?.id === myTeam?.id ? 'mine' : ''}><span className="swatch" style={{ background: t?.color }} />{t?.id === myTeam?.id ? 'You' : t?.name}<span className="t num">{fmt(b.amount)}</span></li>;
              })}
              {!(a.phase === 'live' || a.phase === 'result') || !bids.some(b => b.player_id === a.current_player_id) ? <li className="empty">No bids yet.</li> : null}
            </ol>
          </section>
          {a.status !== 'completed' && (
            <section className="panel feed">
              <div className="label">Who can bid next</div>
              <ul className="nextlist">
                {teams.map(t => {
                  const st = stateOf(a, t, players);
                  return (
                    <li key={t.id}>
                      <span className="swatch" style={{ background: t.color }} />
                      <span className="n">{t.id === myTeam?.id ? 'You' : t.name}</span>
                      <span className={`s ${st.kind === 'ok' ? 'ok' : st.kind === 'lead' ? '' : 'no'}`} style={st.kind === 'lead' ? { color: t.color, fontWeight: 700 } : undefined} title={st.why}>
                        {st.kind === 'ok' ? `Can bid · max ${fmt(maxBidFor(a, t, players, a.phase === 'live' ? current : null))}` : st.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {a.status !== 'completed' && (
            <section className="panel feed">
              <div className="label">Up next · {queue.length} player{queue.length === 1 ? '' : 's'}</div>
              <ol className="upnext">
                {queue.slice(0, 15).map((p, i) => (
                  <li key={p.id}>
                    <span className="i num">{i + 1}</span>
                    <span className="n">{p.name}</span>
                    <span className={`rc rc-${p.role}`}>{ROLE[p.role]}</span>
                    <span className="t num">{fmt(p.base_price)}</span>
                  </li>
                ))}
                {queue.length > 15 && <li className="empty">+ {queue.length - 15} more in the player pool below</li>}
                {!queue.length && <li className="empty">No more players to come.</li>}
              </ol>
            </section>
          )}
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

/** Seat positions around the player: corners and sides first, extra teams fill the gaps. */
const SEATS = ['a', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

function initialsOf(name: string) {
  const w = name.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[1][0] : '')).toUpperCase();
}

type SeatState = { kind: 'lead' | 'ok' | 'no' | 'idle'; text: string; why?: string };

/** Where a team stands on the current player: leading, can bid, or out (and why). */
function stateOf(a: Auction, t: Team, players: Player[]): SeatState {
  const live = a.status !== 'completed' && (a.phase === 'live' || a.phase === 'result');
  if (live && a.leader_team_id === t.id) return { kind: 'lead', text: a.phase === 'result' ? 'Won' : 'Leading' };
  if (a.status === 'completed' || a.phase !== 'live') return { kind: 'idle', text: '–' };
  const why = whyNot(a, t, players);
  if (!why) return { kind: 'ok', text: 'Can bid' };
  if (why.includes('full')) return { kind: 'no', text: 'Squad full', why };
  if (why.startsWith('Not enough') || why.startsWith('Keep')) return { kind: 'no', text: 'Out · purse', why };
  if (why.includes('bowlers or all-rounders')) return { kind: 'no', text: 'Needs other roles', why };
  return { kind: 'no', text: "Can't bid", why };
}

function needsText(a: Auction, t: Team, players: Player[]) {
  const c = roleCounts(t, players);
  const n = squadOf(t, players).length;
  const out: string[] = [];
  const b = a.min_bowlers - c.BOWL, ar = a.min_allrounders - c.AR, sq = a.min_squad - n;
  if (b > 0) out.push(`${b} bowler${b > 1 ? 's' : ''}`);
  if (ar > 0) out.push(`${ar} all-rounder${ar > 1 ? 's' : ''}`);
  if (sq > 0) out.push(`${sq} player${sq > 1 ? 's' : ''}`);
  return out.join(', ');
}

/** Purse, squad and bidding status for every team, under the auction table. */
function TeamTable({ a, teams, players, myTeam, current }: { a: Auction; teams: Team[]; players: Player[]; myTeam: Team | null; current: Player | null }) {
  return (
    <div className="teamtable">
      <span className="label">Teams · purse and squad</span>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Team</th><th className="r">Purse left</th><th className="r">Spent</th><th className="r">Squad</th><th>Still needs</th><th className="r">Max bid</th><th>Status</th></tr></thead>
          <tbody>
            {teams.map(t => {
              const st = stateOf(a, t, players);
              const needs = needsText(a, t, players);
              return (
                <tr key={t.id} className={`${st.kind === 'lead' ? 'lead' : ''}${t.id === myTeam?.id ? ' me' : ''}`}>
                  <td><span className="leader small-leader"><span className="swatch" style={{ background: t.color }} /><b>{t.name}</b>{t.id === myTeam?.id && <span className="tag" style={{ marginLeft: 6 }}>You</span>}</span></td>
                  <td className="r num"><b>{fmt(t.purse_left)}</b></td>
                  <td className="r num">{fmt(a.purse - t.purse_left)}</td>
                  <td className="r num">{squadOf(t, players).length} / {a.max_squad}</td>
                  <td><span className={`needs${needs ? '' : ' met'}`}>{needs || '✓ All set'}</span></td>
                  <td className="r num"><b>{fmt(maxBidFor(a, t, players, current))}</b></td>
                  <td>
                    <span className={`state-tag ${st.kind}`} style={st.kind === 'lead' ? { background: t.color } : undefined} title={st.why}>{st.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
  const [show, setShow] = useState<'ALL' | 'pool' | 'sold' | 'unsold' | 'skipped'>('ALL');
  const count = (k: Player['status']) => players.filter(p => p.status === k).length;
  const statusChips: ['ALL' | 'pool' | 'sold' | 'unsold' | 'skipped', string][] = [
    ['ALL', 'Everyone'], ['pool', `Upcoming (${count('pool')})`], ['sold', `Sold (${count('sold')})`], ['unsold', `Unsold (${count('unsold')})`],
    ...(count('skipped') ? [['skipped', `Skipped (${count('skipped')})`] as ['skipped', string]] : []),
  ];
  const st: Record<Player['status'], string> = { pool: 'Upcoming', live: 'On the block', sold: 'Sold', unsold: 'Unsold', skipped: 'Skipped' };
  return (
    <section>
      <div className="pool-head">
        <h2>Player pool</h2>
        <div className="filters" role="group" aria-label="Filter by status">
          {statusChips.map(([k, label]) => (
            <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>{label}</button>
          ))}
        </div>
        <div className="filters" role="group" aria-label="Filter by role">
          {(['ALL', 'BAT', 'BOWL', 'AR', 'WK'] as const).map(f => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'ALL' ? 'All roles' : ROLE[f] + 's'}</button>
          ))}
        </div>
      </div>
      <div className="panel tablewrap">
        <table>
          <thead><tr><th>Order</th><th>Player</th><th>Role</th><th className="r">Base price</th><th>Status</th><th className="r">Sold for</th><th>Team</th></tr></thead>
          <tbody>
            {players.filter(p => (filter === 'ALL' || p.role === filter) && (show === 'ALL' || p.status === show || (show === 'pool' && p.status === 'live'))).map(p => {
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
