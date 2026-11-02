import { useEffect, useMemo, useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { calcPoints, DEFAULT_RULES, figures, RULE_GROUPS, rulesOf, seriesFigures, teamTotals, type PlayerLine, type RuleKey } from '../lib/points';
import { ROLE } from '../lib/rules';
import type { Auction, Match, Player, PlayerScore, Team } from '../lib/types';
import Avatar from './Avatar';
import { isSeries, MatchDetails, MatchPicker } from './Series';
import { ScorecardImport, ScorecardSource } from './ScorecardImport';

const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ---------------------------------------------------------------------
// Points rules: editable by the admin at any time, read-only for others.
// ---------------------------------------------------------------------
export function PointsRules({ a, isOwner, onSaved }: { a: Auction; isOwner: boolean; onSaved: () => void }) {
  const [d, setD] = useState(() => rulesOf(a.points_rules));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) setD(rulesOf(a.points_rules)); }, [a.points_rules, dirty]);

  const example = calcPoints(
    { player_id: '', auction_id: '', played: true, runs: 104, fours: 10, sixes: 3, out: true, wickets: 0, maidens: 0, catches: 1, stumpings: 0, run_outs: 0, updated_at: '' },
    { role: 'BAT' }, d);
  const bowler = calcPoints(
    { player_id: '', auction_id: '', played: true, runs: 12, fours: 1, sixes: 0, out: true, wickets: 4, maidens: 1, catches: 0, stumpings: 0, run_outs: 0, updated_at: '' },
    { role: 'BOWL' }, d);

  async function save() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('update_points_rules', { p_auction: a.id, p_rules: d });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: errorText(error) });
    setDirty(false); setMsg({ kind: 'ok', text: 'Points rules saved. The leaderboard has been recalculated for everyone.' });
    onSaved();
  }

  return (
    <section className="panel card">
      <div className="row-between">
        <h2>Points rules</h2>
        {!isOwner && <span className="tag">Set by the admin</span>}
      </div>
      <p className="empty" style={{ margin: 0 }}>How each player's match performance turns into points for the team that bought them. {isOwner ? 'You can change these at any time, even after the match. The leaderboard recalculates straight away.' : ''}</p>
      <div className="rule-groups">
        {RULE_GROUPS.map(g => (
          <div className="rule-group" key={g.title}>
            <div className="label">{g.title}</div>
            {g.rules.map(r => (
              <label className="rule" key={r.key} htmlFor={`pr-${r.key}`}>
                <span><b>{r.label}</b>{r.hint && <span className="hint">{r.hint}</span>}</span>
                <input id={`pr-${r.key}`} type="number" step="0.5" disabled={!isOwner} value={d[r.key]}
                  onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setD(prev => ({ ...prev, [r.key as RuleKey]: v })); setDirty(true); setMsg(null); }} />
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="ladder">
        <div>Example: a batter who scores 104 (10 fours, 3 sixes), gets out and takes a catch earns <b>{fmtPts(example.total)} points</b>.</div>
        <div>A bowler who takes 4 wickets with a maiden and scores 12 (1 four) earns <b>{fmtPts(bowler.total)} points</b>.</div>
      </div>
      {isOwner && (
        <div className="row-inline">
          <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save points rules' : 'Points rules saved'}</button>
          <button className="btn" type="button" onClick={() => { setD({ ...DEFAULT_RULES }); setDirty(true); setMsg(null); }}>Use the standard values</button>
        </div>
      )}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------
// WhatsApp share: a ready-made message the admin (or anyone) sends to the group.
// ---------------------------------------------------------------------
function shareText(a: Auction, rows: ReturnType<typeof teamTotals>, matches: Match[], cur: Match | null, series: boolean,
  top: { p: Player; team: Team; b: { total: number } }[]) {
  const done = matches.filter(m => m.status === 'done');
  const final = series && !cur && done.length === matches.length;
  const head = series
    ? cur ? `${a.name}: ${cur.title} points` : final ? `${a.name}: FINAL series standings 🏆` : `${a.name}: standings after ${done.length} of ${matches.length} matches`
    : `${a.name}: leaderboard`;
  const lines = [`🏏 ${head}`, ''];
  rows.forEach((r, i) => lines.push(`${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${r.team.name}: ${fmtPts(r.total)} pts`));
  const last = series && !cur ? done[done.length - 1] : null;
  if (last) {
    const best = rows.slice().sort((x, y) => (y.byMatch[last.id] ?? 0) - (x.byMatch[last.id] ?? 0))[0];
    if (best && best.byMatch[last.id] != null) lines.push('', `Best in ${last.title}: ${best.team.name} (${fmtPts(best.byMatch[last.id])} pts)`);
  }
  if (top[0]) lines.push(`⭐ Top player${series && !cur ? ' of the series' : ''}: ${top[0].p.name} (${top[0].team.name}), ${fmtPts(top[0].b.total)} pts`);
  lines.push('', `Full leaderboard: ${window.location.origin}/a/${a.id}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------
// Leaderboard: every team's total, with each player's points.
// ---------------------------------------------------------------------
export function Leaderboard({ a, teams, players, scores, matches = [], myTeam }: { a: Auction; teams: Team[]; players: Player[]; scores: PlayerScore[]; matches?: Match[]; myTeam: Team | null }) {
  const series = isSeries(a, matches);
  const [sel, setSel] = useState<string>('all');
  const matchId = series && sel !== 'all' ? sel : null;
  const cur = matches.find(m => m.id === matchId) ?? null;
  const rows = useMemo(() => teamTotals(teams, players, scores, a.points_rules, matches, matchId), [teams, players, scores, a.points_rules, matches, matchId]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [why, setWhy] = useState<string | null>(null);
  const latest = scores.reduce<string>((m, s) => (s.updated_at > m ? s.updated_at : m), '');
  const top = rows.flatMap(r => r.squad.map(x => ({ ...x, team: r.team }))).filter(x => x.b.total > 0).sort((x, y) => y.b.total - x.b.total).slice(0, 5);
  const leaderTotal = rows[0]?.total ?? 0;
  const done = matches.filter(m => m.status === 'done').length;
  const final = series && done === matches.length;
  const scored = (id: string) => scores.some(s => s.match_id === id);
  const fig = (x: PlayerLine) => (series && !matchId ? seriesFigures(x.per) : figures(x.s));
  const has = (x: PlayerLine) => (series && !matchId ? x.per.length > 0 : !!x.s);

  return (
    <>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{series ? (matchId ? `${cur?.title} leaderboard` : final ? 'Final series standings' : 'Series leaderboard') : 'Leaderboard'}</h2>
        <a className="btn wa-btn" href={`https://wa.me/?text=${encodeURIComponent(shareText(a, rows, matches, cur, series, top))}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
      </div>
      <div className="row-between board-sub">
        <span className="empty">
          {series ? `${done} of ${matches.length} matches finished` : ''}
          {series && scores.length ? ' · ' : ''}
          {scores.length ? `Scores last updated ${new Date(latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : series ? '' : 'No match scores entered yet'}
        </span>
      </div>
      {series && <MatchPicker matches={matches} value={sel} onChange={id => { setSel(id); setWhy(null); }} withTotal hasScores={scored} />}
      {final && !matchId && rows[0] && rows[0].total > 0 && (
        <div className="series-banner panel"><span aria-hidden="true">🏆</span> <b>{rows[0].team.name}</b> wins the series with <b className="num">{fmtPts(rows[0].total)}</b> points{rows[1] ? `, ${fmtPts(rows[0].total - rows[1].total)} ahead of ${rows[1].team.name}` : ''}.</div>
      )}
      {matchId && !scored(matchId) && <p className="empty">No scores entered for {cur?.title} yet.</p>}
      {(cur ?? (!series ? matches[0] : null)) && <ScorecardSource m={(cur ?? matches[0])!} />}
      {series && !matchId && matches.some(m => m.scorecard_text) && <p className="hint" style={{ margin: 0 }}>Tap a match above to see the original scorecard its points came from.</p>}
      <div className="board">
        {rows.map((r, i) => {
          const isOpen = open[r.team.id] ?? r.team.id === myTeam?.id;
          return (
            <section key={r.team.id} className={`panel board-row${r.team.id === myTeam?.id ? ' me' : ''}`}>
              <button className="board-head" onClick={() => setOpen(o => ({ ...o, [r.team.id]: !isOpen }))} aria-expanded={isOpen}>
                <span className="rank num">{i + 1}</span>
                <span className="swatch" style={{ background: r.team.color }} />
                <b className="bname">{r.team.name}{r.team.id === myTeam?.id ? ' (you)' : ''}</b>
                <span className="gap num">{i > 0 && leaderTotal > r.total ? `${fmtPts(leaderTotal - r.total)} behind` : ''}</span>
                <span className="btotal num">{fmtPts(r.total)}<small> pts</small></span>
              </button>
              {series && !matchId && (
                <div className="match-chips">
                  {matches.map(m => <span key={m.id} className="mchip num" title={m.title}>{m.title}: <b>{r.byMatch[m.id] != null ? fmtPts(r.byMatch[m.id]) : '–'}</b></span>)}
                </div>
              )}
              {isOpen && (
                <ul className="board-squad">
                  {r.squad.map(x => (
                    <li key={x.p.id} className="tap" onClick={() => setWhy(w => (w === x.p.id ? null : x.p.id))}>
                      <Avatar p={x.p} size={30} />
                      <span className="who-col"><b>{x.p.name}</b><span className="empty">{ROLE[x.p.role]} · {fig(x)}</span>
                        {why === x.p.id && x.b.parts.length > 0 && <span className="why-pts">{x.b.parts.map(pp => `${pp.label} ${pp.pts > 0 ? '+' : ''}${fmtPts(pp.pts)}`).join(' · ')}</span>}
                      </span>
                      <span className="pts num">{has(x) ? fmtPts(x.b.total) : '–'}</span>
                    </li>
                  ))}
                  {!r.squad.length && <li className="empty">No players bought.</li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {top.length > 0 && (
        <section className="panel card">
          <div className="label">{series ? (matchId ? `Top players in ${cur?.title}` : 'Top players of the series') : 'Top players so far'}</div>
          <ul className="board-squad">
            {top.map(x => (
              <li key={x.p.id}>
                <Avatar p={x.p} size={30} />
                <span className="who-col"><b>{x.p.name}</b><span className="empty"><span className="swatch" style={{ background: x.team.color, display: 'inline-block', marginRight: 6 }} />{x.team.name} · {fig(x)}</span></span>
                <span className="pts num">{fmtPts(x.b.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="empty">Tap a team to see its players, and tap a player to see how their points were worked out{series && !matchId ? ' match by match' : ''}.</p>
    </>
  );
}

// ---------------------------------------------------------------------
// Score entry (admin): type in each player's match figures.
// ---------------------------------------------------------------------
type Row = Omit<PlayerScore, 'auction_id' | 'updated_at' | 'match_id'>;
const NUMS: { k: keyof Row; label: string; max?: number }[] = [
  { k: 'runs', label: 'Runs' }, { k: 'fours', label: '4s' }, { k: 'sixes', label: '6s' },
  { k: 'wickets', label: 'Wkts', max: 10 }, { k: 'maidens', label: 'Mdns' },
  { k: 'catches', label: 'Ct' }, { k: 'stumpings', label: 'St' }, { k: 'run_outs', label: 'RO' },
];
const blank = (id: string): Row => ({ player_id: id, played: true, runs: 0, fours: 0, sixes: 0, out: false, wickets: 0, maidens: 0, catches: 0, stumpings: 0, run_outs: 0 });

export function ScoreEntry({ a, teams, players, scores: allScores, matches = [], onSaved }: { a: Auction; teams: Team[]; players: Player[]; scores: PlayerScore[]; matches?: Match[]; onSaved: () => void }) {
  const series = isSeries(a, matches);
  const [pick, setPick] = useState<string | null>(null);
  // Default: the first match that isn't finished yet (or the last one).
  const match = matches.find(m => m.id === pick) ?? matches.find(m => m.status !== 'done') ?? matches[matches.length - 1] ?? null;
  const scores = useMemo(() => (match ? allScores.filter(s => !s.match_id || s.match_id === match.id) : allScores), [allScores, match]);
  // Stay on the chosen match (marking it finished shouldn't jump to the next one).
  useEffect(() => { if (!pick && match) setPick(match.id); }, [pick, match]);
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pasting, setPasting] = useState(false);
  const saved = useMemo(() => new Map(scores.map(s => [s.player_id, s])), [scores]);
  const teamOf = (p: Player) => teams.find(t => t.id === p.sold_to);

  const list = players
    .filter(p => showAll || p.sold_to)
    .sort((x, y) => (teamOf(x)?.name ?? '~').localeCompare(teamOf(y)?.name ?? '~') || x.order_no - y.order_no);
  const dirtyIds = Object.keys(draft);

  const rowOf = (p: Player): Row => draft[p.id] ?? (saved.get(p.id) ? { ...(saved.get(p.id) as PlayerScore) } : blank(p.id));
  const edit = (p: Player, patch: Partial<Row>) => { setDraft(d => ({ ...d, [p.id]: { ...rowOf(p), ...patch } })); setMsg(null); };

  async function save() {
    if (!dirtyIds.length) return;
    setBusy(true); setMsg(null);
    const rows = dirtyIds.map(id => draft[id]);
    const { error } = await supabase.rpc('set_scores', match ? { p_auction: a.id, p_match: match.id, p_rows: rows } : { p_auction: a.id, p_rows: rows });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: errorText(error) });
    setDraft({});
    setMsg({ kind: 'ok', text: `Saved ${rows.length} player${rows.length > 1 ? 's' : ''}${series && match ? ` for ${match.title}` : ''}. The leaderboard is updated for everyone.` });
    onSaved();
  }
  async function clear(p: Player) {
    setDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
    if (!saved.get(p.id)) return;
    const clearRow = [{ player_id: p.id, clear: true }];
    const { error } = await supabase.rpc('set_scores', match ? { p_auction: a.id, p_match: match.id, p_rows: clearRow } : { p_auction: a.id, p_rows: clearRow });
    if (error) setMsg({ kind: 'bad', text: errorText(error) }); else onSaved();
  }

  return (
    <section className="panel card">
      <div className="row-between">
        <h2>{series && match ? `Enter scores: ${match.title}` : 'Enter match scores'}</h2>
        <label className="check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show unsold players too</label>
      </div>
      {series && match && (
        <>
          <MatchPicker matches={matches} value={match.id} hasScores={id => allScores.some(s => s.match_id === id)}
            onChange={id => { if (dirtyIds.length) { setMsg({ kind: 'bad', text: 'Save or discard your changes before switching matches.' }); return; } setPick(id); setMsg(null); }} />
          <MatchDetails a={a} m={match} count={matches.length} hasScores={scores.length > 0} onSaved={onSaved} />
        </>
      )}
      {match && (
        <>
          <ScorecardImport key={match.id} a={a} match={match} players={players} teams={teams} series={series}
            onOpenChange={setPasting} onSaved={text => { setDraft({}); setMsg({ kind: 'ok', text }); onSaved(); }} />
          <ScorecardSource m={match} />
        </>
      )}
      {pasting ? null : (
        <>
      <p className="empty" style={{ margin: 0 }}>{match ? 'Or type' : 'Type'} each player's figures from the scorecard, then press Save. You can update during the match as often as you like; everyone's leaderboard updates when you save. Untick "Played" for anyone not in the playing XI. "Out" matters only for the duck penalty.</p>
      <div className="tablewrap">
        <table className="score-table">
          <thead><tr><th>Player</th><th>Played</th>{NUMS.slice(0, 3).map(n => <th key={n.k} className="r">{n.label}</th>)}<th>Out</th>{NUMS.slice(3).map(n => <th key={n.k} className="r">{n.label}</th>)}<th className="r">Points</th><th /></tr></thead>
          <tbody>
            {list.map(p => {
              const r = rowOf(p); const t = teamOf(p);
              const has = !!draft[p.id] || saved.has(p.id);
              const pts = has ? calcPoints({ ...r, auction_id: a.id, updated_at: '' }, p, a.points_rules).total : null;
              return (
                <tr key={p.id} className={draft[p.id] ? 'dirty' : ''}>
                  <td><span className="who-cell"><span className="swatch" style={{ background: t?.color ?? 'transparent', border: t ? 0 : '1px dashed var(--line)' }} /><span><b>{p.name}</b><span className="empty block">{t?.name ?? 'Unsold'} · {p.role}</span></span></span></td>
                  <td className="c"><input type="checkbox" aria-label={`${p.name} played`} checked={r.played} onChange={e => edit(p, { played: e.target.checked })} /></td>
                  {NUMS.slice(0, 3).map(n => <td key={n.k} className="r"><input className="numin" type="number" min={0} max={n.max} inputMode="numeric" aria-label={`${p.name} ${n.label}`} value={has ? (r[n.k] as number) : ''} placeholder="0" onChange={e => edit(p, { [n.k]: Math.max(0, Math.min(n.max ?? 999, Number(e.target.value) || 0)) })} /></td>)}
                  <td className="c"><input type="checkbox" aria-label={`${p.name} out`} checked={r.out} onChange={e => edit(p, { out: e.target.checked })} /></td>
                  {NUMS.slice(3).map(n => <td key={n.k} className="r"><input className="numin" type="number" min={0} max={n.max} inputMode="numeric" aria-label={`${p.name} ${n.label}`} value={has ? (r[n.k] as number) : ''} placeholder="0" onChange={e => edit(p, { [n.k]: Math.max(0, Math.min(n.max ?? 999, Number(e.target.value) || 0)) })} /></td>)}
                  <td className="r num"><b>{pts == null ? '–' : fmtPts(pts)}</b></td>
                  <td>{has && <button className="linkish" onClick={() => clear(p)}>Clear</button>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={13} className="empty">No players have been bought yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row-inline save-bar">
        <button className="btn go" onClick={save} disabled={busy || !dirtyIds.length}>{busy ? 'Saving…' : dirtyIds.length ? `Save ${dirtyIds.length} change${dirtyIds.length > 1 ? 's' : ''}` : 'All saved'}</button>
        {dirtyIds.length > 0 && <button className="btn" onClick={() => { setDraft({}); setMsg(null); }}>Discard changes</button>}
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </div>
        </>
      )}
      {pasting && msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}
