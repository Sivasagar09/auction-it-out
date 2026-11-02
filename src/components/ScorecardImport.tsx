import { useMemo, useState } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { calcPoints, figures } from '../lib/points';
import { matchPlayers, parseScorecard, type MatchRow, type ParsedScorecard } from '../lib/scorecard';
import type { Auction, Match, Player, PlayerScore, Team } from '../lib/types';
import './scorecard.css';

const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const KIND: Record<MatchRow['kind'], [string, string]> = {
  exact: ['Same name', 'ok'],
  close: ['Spelling differs', 'ok'],
  check: ['Please check', 'warn'],
  none: ['Not in this auction', 'muted'],
};

/** Admin: paste the scorecard text, check what was read and matched, then save. */
export function ScorecardImport({ a, match, players, teams, series, onSaved, onOpenChange }: {
  a: Auction; match: Match; players: Player[]; teams: Team[]; series: boolean; onSaved: (msg: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedScorecard | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({}); // row index -> player id ('' = not in auction)
  const [done, setDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const auto = useMemo(() => (parsed ? matchPlayers(parsed, players) : []), [parsed, players]);
  const teamOf = (p: Player | null | undefined) => teams.find(t => t.id === p?.sold_to);
  const rows = auto.map((r, i) => {
    const id = i in pick ? pick[i] : r.player?.id ?? '';
    const player = players.find(p => p.id === id) ?? null;
    const kind: MatchRow['kind'] = i in pick ? (player ? 'exact' : 'none') : r.kind;
    return { ...r, player, kind, i, changed: i in pick };
  });
  const usedIds = new Set(rows.map(r => r.player?.id).filter(Boolean) as string[]);
  const absent = players.filter(p => p.sold_to && !usedIds.has(p.id));
  const toCheck = rows.filter(r => r.kind === 'check').length;
  const bought = rows.filter(r => teamOf(r.player));

  function read() {
    setErr('');
    const sc = parseScorecard(text);
    if (!sc.players.length) { setParsed(null); setErr(sc.notes[0] ?? 'Nothing could be read from that text.'); return; }
    setParsed(sc); setPick({});
  }

  async function save() {
    if (!parsed) return;
    const ids = rows.map(r => r.player?.id).filter(Boolean) as string[];
    const dup = players.find(p => ids.filter(x => x === p.id).length > 1);
    if (dup) return setErr(`${dup.name} is chosen for two different scorecard names. Pick the right one for each.`);
    setBusy(true); setErr('');
    const toRow = (p: Player, f: Partial<PlayerScore> & { played: boolean }) => ({
      player_id: p.id, played: f.played, runs: f.runs ?? 0, fours: f.fours ?? 0, sixes: f.sixes ?? 0, out: f.out ?? false,
      wickets: f.wickets ?? 0, maidens: f.maidens ?? 0, catches: f.catches ?? 0, stumpings: f.stumpings ?? 0, run_outs: f.run_outs ?? 0,
    });
    const payload = [
      ...rows.filter(r => r.player).map(r => toRow(r.player!, r.sc)),
      ...absent.map(p => toRow(p, { played: false })),
    ];
    const aliases = rows.filter(r => r.player && r.player.name.toLowerCase() !== r.sc.name.toLowerCase())
      .map(r => ({ player_id: r.player!.id, alias: r.sc.name }));
    const { error } = await supabase.rpc('import_scorecard', {
      p_auction: a.id, p_match: match.id, p_rows: payload, p_text: text, p_url: url.trim() || null, p_aliases: aliases, p_done: done,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setOpen(false); setText(''); setUrl(''); setParsed(null); setPick({});
    onSaved(`Scorecard saved for ${match.title}: ${bought.length} bought players scored, ${absent.length} marked as not playing. Everyone can now see the original scorecard on the leaderboard.`);
  }

  if (!open) {
    return (
      <div className="sc-cta">
        <button className="btn primary" onClick={() => setOpen(true)}>📋 Paste scorecard{series ? ` for ${match.title}` : ''}</button>
        <span className="hint">Fastest way: copy the whole Cricinfo "Full scorecard" page and paste it here. Points fill in by themselves.</span>
      </div>
    );
  }

  return (
    <section className="sc-import">
      <div className="row-between">
        <h3>Paste scorecard{series ? `: ${match.title}` : ''}</h3>
        <button className="btn" onClick={() => { setOpen(false); setParsed(null); }}>Close</button>
      </div>
      {!parsed && (
        <>
          <ol className="sc-steps">
            <li>Open the match's <b>Full scorecard</b> page on Cricinfo.</li>
            <li>Press <kbd>Ctrl</kbd>+<kbd>A</kbd> then <kbd>Ctrl</kbd>+<kbd>C</kbd> (on a phone: long-press, <b>Select all</b>, <b>Copy</b>).</li>
            <li>Paste below and press <b>Read scorecard</b>. Nothing is saved until you confirm.</li>
          </ol>
          <textarea className="sc-text" value={text} onChange={e => setText(e.target.value)} placeholder="Paste the scorecard here" aria-label="Scorecard text" spellCheck={false} />
          <div className="field"><label htmlFor="sc-url">Scorecard link (optional, shown to everyone)</label>
            <input id="sc-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.espncricinfo.com/series/…/full-scorecard" inputMode="url" />
          </div>
          {err && <div className="msg bad">{err}</div>}
          <div className="row-inline"><button className="btn go" disabled={text.trim().length < 20} onClick={read}>Read scorecard</button></div>
        </>
      )}

      {parsed && (
        <>
          <div className="sc-summary">
            <span><b>{parsed.teams.join(' v ')}</b> · {parsed.players.length} players read · <b>{bought.length}</b> of your bought players are in it</span>
            {toCheck > 0 && <span className="tag warn-tag">{toCheck} name{toCheck > 1 ? 's' : ''} to check</span>}
          </div>
          <div className="tablewrap">
            <table className="score-table sc-table">
              <thead><tr><th>On the scorecard</th><th>Auction player</th><th>Match</th><th>Figures</th><th className="r">Points</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const t = teamOf(r.player);
                  const [label, tone] = r.changed ? ['Chosen by you', 'ok'] : KIND[r.kind];
                  const pts = r.player ? calcPoints({ ...r.sc, player_id: r.player.id, auction_id: a.id, updated_at: '' }, r.player, a.points_rules).total : null;
                  return (
                    <tr key={r.i} className={`sc-${tone}${r.player ? '' : ' sc-dim'}`}>
                      <td><b>{r.sc.name}</b><span className="empty block">{r.sc.team} · {r.sc.how || 'played'}</span></td>
                      <td>
                        <select aria-label={`Auction player for ${r.sc.name}`} value={r.player?.id ?? ''} onChange={e => setPick(p => ({ ...p, [r.i]: e.target.value }))}>
                          <option value="">Not in this auction</option>
                          {players.map(p => <option key={p.id} value={p.id}>{p.name}{teamOf(p) ? ` (${teamOf(p)!.name})` : ' (unsold)'}</option>)}
                        </select>
                        {t && <span className="empty block"><span className="swatch" style={{ background: t.color, display: 'inline-block', marginRight: 6 }} />{t.name}</span>}
                      </td>
                      <td><span className={`tag sc-tag-${tone}`}>{label}</span></td>
                      <td className="empty">{figures({ ...r.sc, player_id: '', auction_id: '', updated_at: '' })}</td>
                      <td className="r num"><b>{pts == null ? '–' : t ? fmtPts(pts) : <span className="empty" title="Not bought by any team">{fmtPts(pts)}*</span>}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ margin: 0 }}>* Unsold players are saved too, but their points don't count for any team.</p>
          {absent.length > 0 && (
            <div className="msg"><b>Bought but not in this scorecard</b> (will get 0 as "did not play"): {absent.map(p => `${p.name} (${teamOf(p)?.name})`).join(', ')}.
              If one of them did play under a different spelling, pick them in the list above.</div>
          )}
          {parsed.notes.length > 0 && <div className="msg"><b>Notes:</b><ul>{parsed.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
          {toCheck > 0 && <div className="msg bad">Please check the rows marked "Please check". The spelling is close but not certain. Pick the right player, or "Not in this auction".</div>}
          <label className="check"><input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} /> Mark {match.title} as finished</label>
          {err && <div className="msg bad">{err}</div>}
          <div className="row-inline">
            <button className="btn go" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save these scores'}</button>
            <button className="btn" disabled={busy} onClick={() => setParsed(null)}>Back to the text</button>
          </div>
          <span className="hint">Spellings you confirm are remembered for the next match.</span>
        </>
      )}
    </section>
  );
}

/** Everyone: where this match's points came from. */
export function ScorecardSource({ m }: { m: Match }) {
  const [show, setShow] = useState(false);
  if (!m.scorecard_text) return null;
  const when = m.scored_at ? new Date(m.scored_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <div className="sc-source panel">
      <div className="row-inline">
        <span>📋 Points for <b>{m.title}</b> come from the scorecard posted by <b>{m.scored_by_name ?? 'the admin'}</b>{when ? ` on ${when}` : ''}.</span>
        {m.scorecard_url && <a className="linkish" href={m.scorecard_url} target="_blank" rel="noopener noreferrer">Open on Cricinfo</a>}
        <button className="linkish" onClick={() => setShow(s => !s)} aria-expanded={show}>{show ? 'Hide original scorecard' : 'View original scorecard'}</button>
      </div>
      {m.edited_at && <div className="hint">Some figures were changed by hand after that, on {new Date(m.edited_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</div>}
      {show && <pre className="sc-original">{m.scorecard_text}</pre>}
    </div>
  );
}
