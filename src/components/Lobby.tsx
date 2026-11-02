import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorText, supabase } from '../lib/supabase';
import { describeLevels, fmt, ROLE } from '../lib/rules';
import { parseSheet } from '../lib/sheet';
import type { Auction, Level, Player, Team } from '../lib/types';
import type { AuctionState } from '../lib/useAuction';
import Avatar from './Avatar';
import { downloadPlayers, downloadTemplate } from '../lib/template';

type Props = AuctionState & { auction: Auction; isOwner: boolean; myTeam: Team | null; userId: string };

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export default function Lobby(props: Props) {
  const { auction: a, teams, players, isOwner, myTeam, userId, reload } = props;
  const nav = useNavigate();
  const [startErr, setStartErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const link = `${window.location.origin}/join/${a.join_code}`;
  const [copied, setCopied] = useState('');

  const counts = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  players.forEach(p => counts[p.role]++);
  const T = teams.length;
  const minBase = players.length ? Math.min(...players.map(p => p.base_price)) : 0;
  const checks: [boolean, string][] = [
    [T >= 2, T >= 2 ? `${T} of ${a.max_teams} teams have joined` : `${T} of ${a.max_teams} teams joined. At least 2 are needed to start`],
    [players.length > 0, players.length ? `${players.length} players in the sheet` : 'No player sheet uploaded yet'],
    [players.length >= T * a.min_squad, `${players.length >= T * a.min_squad ? 'Enough' : 'Not enough'} players for every team to reach the minimum squad of ${a.min_squad} (needs ${T * a.min_squad})`],
    [counts.BOWL >= T * a.min_bowlers, `${counts.BOWL} bowlers for ${T} teams needing ${a.min_bowlers} each`],
    [counts.AR >= T * a.min_allrounders, `${counts.AR} all-rounders for ${T} teams needing ${a.min_allrounders} each`],
    [a.purse >= Math.max(a.min_squad, a.min_bowlers + a.min_allrounders) * minBase, `Purse of ${fmt(a.purse)} covers a minimum squad at the lowest base price (${fmt(minBase)})`],
  ];

  async function start() {
    setStartErr('');
    const { error } = await supabase.rpc('start_auction', { p_auction: a.id });
    if (error) setStartErr(errorText(error)); else reload();
  }
  async function del() {
    const { error } = await supabase.rpc('delete_auction', { p_auction: a.id });
    if (error) setStartErr(errorText(error)); else nav('/');
  }

  return (
    <>
      <div className="lobby-head">
        <div>
          <span className="label">Auction lobby · rules can change until the admin starts</span>
          <h2 className="title">{a.name}</h2>
        </div>
        <div className="share panel">
          <div><span className="label">Join code</span><div className="code num">{a.join_code}</div></div>
          <div className="share-actions">
            <button className="btn" onClick={async () => setCopied((await copy(link)) ? 'Link copied' : link)}>Copy invite link</button>
            <button className="btn" onClick={async () => setCopied((await copy(a.join_code)) ? 'Code copied' : a.join_code)}>Copy code</button>
          </div>
          {copied && <span className="hint">{copied}</span>}
        </div>
      </div>

      <div className="summary">
        <div><div className="label">Teams</div><div className="v num">{T} / {a.max_teams}</div></div>
        <div><div className="label">Players</div><div className="v num">{players.length}</div></div>
        <div><div className="label">Purse each</div><div className="v num">{fmt(a.purse)}</div></div>
        <div><div className="label">Bid timer</div><div className="v num">{a.timer_seconds}s</div></div>
      </div>

      <div className="setup">
        <RulesForm a={a} isOwner={isOwner} teamsJoined={T} onSaved={reload} />
        <div className="stack">
          <TeamsJoined a={a} teams={teams} isOwner={isOwner} myTeam={myTeam} userId={userId} onChange={reload} />
          <PlayerSheet a={a} players={players} isOwner={isOwner} onSaved={reload} />
        </div>
      </div>

      <section className="panel card startbar-panel">
        <div className="checks">
          {checks.map(([ok, t], i) => <div key={i} className={`c ${ok ? 'ok' : 'warn'}`}><i>{ok ? '✓' : '!'}</i><span>{t}</span></div>)}
        </div>
        {isOwner ? (
          <div className="start-col">
            <button className="btn go" onClick={start} disabled={T < 2 || players.length === 0}>Start auction</button>
            <span className="hint">Starting locks the rules, the teams and the player list for everyone.</span>
            {startErr && <div className="msg bad">{startErr}</div>}
            {!confirmDelete
              ? <button className="linkish" onClick={() => setConfirmDelete(true)}>Delete this auction</button>
              : <div className="confirm">Delete "{a.name}" for everyone? <button className="btn danger" onClick={del}>Delete</button><button className="btn" onClick={() => setConfirmDelete(false)}>Keep</button></div>}
          </div>
        ) : (
          <div className="start-col"><span className="waiting">Waiting for the admin to start the auction…</span>
            <span className="hint">This page switches to the auction room automatically.</span></div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------
function RulesForm({ a, isOwner, teamsJoined, onSaved }: { a: Auction; isOwner: boolean; teamsJoined: number; onSaved: () => void }) {
  const fromAuction = () => ({
    name: a.name, max_teams: a.max_teams, purseCr: a.purse / 100, timer_seconds: a.timer_seconds,
    min_squad: a.min_squad, max_squad: a.max_squad, min_bowlers: a.min_bowlers, min_allrounders: a.min_allrounders,
    increments: [...a.increments].sort((x, y) => x.from - y.from),
  });
  const [d, setD] = useState(fromAuction);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!dirty) setD(fromAuction()); /* eslint-disable-next-line */ }, [a]);

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => { setD(prev => ({ ...prev, [k]: v })); setDirty(true); setMsg(null); };
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setLevel = (i: number, k: keyof Level, v: number) => set('increments', d.increments.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function save() {
    setBusy(true); setMsg(null);
    const levels = d.increments.map((l, i) => ({ from: i === 0 ? 0 : Math.round(l.from), step: Math.round(l.step) }));
    const { error } = await supabase.rpc('update_auction_settings', {
      p_auction: a.id,
      p_settings: {
        name: d.name, max_teams: d.max_teams, purse: Math.round(d.purseCr * 100), timer_seconds: d.timer_seconds,
        min_squad: d.min_squad, max_squad: d.max_squad, min_bowlers: d.min_bowlers, min_allrounders: d.min_allrounders,
        increments: levels,
      },
    });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: errorText(error) });
    setDirty(false); setMsg({ kind: 'ok', text: 'Rules saved. Everyone in the lobby sees them now.' });
    onSaved();
  }

  const { lines, ladder } = describeLevels(d.increments.length ? d.increments : [{ from: 0, step: 5 }]);
  const dis = !isOwner;

  return (
    <section className="panel form">
      <div className="group">
        <div className="row-between"><h2 style={{ margin: 0 }}>Rules</h2>{!isOwner && <span className="tag">Set by the admin</span>}</div>
        {isOwner && <div className="field"><label htmlFor="rName">Auction name</label><input id="rName" value={d.name} onChange={e => set('name', e.target.value)} /></div>}
        <div className="row2">
          <div className="field"><label htmlFor="rTeams">Max teams</label>
            <input id="rTeams" type="number" min={Math.max(2, teamsJoined)} max={20} disabled={dis} value={d.max_teams} onChange={e => set('max_teams', num(e.target.value))} /></div>
          <div className="field"><label htmlFor="rPurse">Purse each (₹ Cr)</label>
            <input id="rPurse" type="number" min={0.1} step={0.5} disabled={dis} value={d.purseCr} onChange={e => set('purseCr', num(e.target.value))} /></div>
        </div>
        <div className="field"><label htmlFor="rTimer">Bid timer (seconds)</label>
          <input id="rTimer" type="number" min={3} max={120} disabled={dis} value={d.timer_seconds} onChange={e => set('timer_seconds', num(e.target.value))} />
          <span className="hint">The clock restarts after every bid. When it runs out, the player goes to the highest bidder.</span></div>
      </div>

      <div className="group">
        <span className="fl">Bid increments</span>
        <span className="hint">Each click adds a fixed amount. When the bid reaches a level's starting price, that level's raise applies. Amounts in ₹ lakh (100 = ₹1 Cr).</span>
        <div className="slabs">
          {d.increments.map((l, i) => (
            <div className="slab" key={i}>
              <div className="field">{i === 0
                ? <><span className="hint">From</span><div className="fixed">Base price</div></>
                : <><label className="hint" htmlFor={`lf${i}`}>From (₹ L)</label><input id={`lf${i}`} type="number" min={1} disabled={dis} value={l.from} onChange={e => setLevel(i, 'from', num(e.target.value))} /></>}
              </div>
              <div className="field"><label className="hint" htmlFor={`ls${i}`}>Raise per bid (₹ L)</label>
                <input id={`ls${i}`} type="number" min={1} disabled={dis} value={l.step} onChange={e => setLevel(i, 'step', num(e.target.value))} /></div>
              <button className="x" type="button" aria-label="Remove this level" disabled={dis || i === 0}
                onClick={() => set('increments', d.increments.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        {isOwner && <button className="btn" type="button" style={{ alignSelf: 'flex-start' }}
          onClick={() => { const last = d.increments[d.increments.length - 1]; set('increments', [...d.increments, { from: Math.max(last?.from ?? 0, 100) + 100, step: (last?.step ?? 5) * 2 }]); }}>Add level</button>}
        <div className="ladder">
          {lines.map((l, i) => <div key={i}>{l.range}: <b>{l.step}</b></div>)}
          <div>Example from ₹50 L: {ladder.join(' → ')} …</div>
        </div>
      </div>

      <div className="group">
        <span className="fl">Squad rules</span>
        <div className="row2">
          <div className="field"><label htmlFor="rMin">Min squad</label><input id="rMin" type="number" min={0} max={25} disabled={dis} value={d.min_squad} onChange={e => set('min_squad', num(e.target.value))} /></div>
          <div className="field"><label htmlFor="rMax">Max squad</label><input id="rMax" type="number" min={1} max={25} disabled={dis} value={d.max_squad} onChange={e => set('max_squad', num(e.target.value))} /></div>
          <div className="field"><label htmlFor="rBowl">Min bowlers</label><input id="rBowl" type="number" min={0} max={10} disabled={dis} value={d.min_bowlers} onChange={e => set('min_bowlers', num(e.target.value))} /></div>
          <div className="field"><label htmlFor="rAR">Min all-rounders</label><input id="rAR" type="number" min={0} max={10} disabled={dis} value={d.min_allrounders} onChange={e => set('min_allrounders', num(e.target.value))} /></div>
        </div>
        <span className="hint">Teams can't spend money or fill squad places in a way that leaves them unable to meet these rules.</span>
      </div>

      {isOwner && (
        <div className="group">
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save rules' : 'Rules saved'}</button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
function TeamsJoined({ a, teams, isOwner, myTeam, userId, onChange }: { a: Auction; teams: Team[]; isOwner: boolean; myTeam: Team | null; userId: string; onChange: () => void }) {
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(t: Team) {
    setErr('');
    const { error } = await supabase.rpc('remove_team', { p_team: t.id });
    setConfirm(null);
    if (error) setErr(errorText(error)); else onChange();
  }
  async function ownerJoin() {
    setErr('');
    const { error } = await supabase.rpc('owner_join', { p_auction: a.id, p_team_name: name });
    if (error) setErr(errorText(error)); else onChange();
  }

  return (
    <section className="panel card">
      <div className="row-between"><h2 style={{ margin: 0 }}>Teams</h2><span className="empty num">{teams.length} of {a.max_teams}</span></div>
      <ul className="joined">
        {teams.map(t => (
          <li key={t.id}>
            <span className="swatch" style={{ background: t.color }} />
            <b>{t.name}</b>
            {t.user_id === a.owner_id && <span className="tag">Admin</span>}
            {t.user_id === userId && <span className="tag">You</span>}
            {(isOwner || t.user_id === userId) && (confirm === t.id
              ? <span className="confirm">{t.user_id === userId ? 'Leave?' : 'Remove?'} <button className="btn danger" onClick={() => remove(t)}>Yes</button><button className="btn" onClick={() => setConfirm(null)}>No</button></span>
              : <button className="linkish" onClick={() => setConfirm(t.id)}>{t.user_id === userId ? 'Leave' : 'Remove'}</button>)}
          </li>
        ))}
        {teams.length === 0 && <li className="empty">No teams yet. Share the join code.</li>}
      </ul>
      {isOwner && !myTeam && (
        <div className="inline-form">
          <input aria-label="Your team name" placeholder="Your team name" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
          <button className="btn" onClick={ownerJoin} disabled={!name.trim()}>Bid with a team too</button>
        </div>
      )}
      {err && <div className="msg bad">{err}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------
function PlayerSheet({ a, players, isOwner, onSaved }: { a: Auction; players: Player[]; isOwner: boolean; onSaved: () => void }) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | ''; text: string; list?: string[] } | null>(null);
  const [over, setOver] = useState(false);
  const [filter, setFilter] = useState<'ALL' | Player['role']>('ALL');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(file?: File) {
    if (!file) return;
    setMsg({ kind: '', text: `Reading ${file.name}…` });
    try {
      const { players: rows, errors, warnings, statLabels } = await parseSheet(file);
      if (!rows.length) return setMsg({ kind: 'bad', text: `No players found in ${file.name}.`, list: errors });
      const { error } = await supabase.rpc('set_players', { p_auction: a.id, p_players: rows });
      if (error) return setMsg({ kind: 'bad', text: errorText(error) });
      const photos = rows.filter(r => r.photo).length;
      const extras = [
        photos ? `${photos} with photos` : '',
        statLabels.length ? `stats shown: ${statLabels.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      const summary = `Saved ${rows.length} players from ${file.name}, in auction order${extras ? ` (${extras})` : ''}.`;
      const problems = [...errors, ...warnings];
      setMsg(problems.length
        ? { kind: 'bad', text: `${summary} ${errors.length ? `${errors.length} row${errors.length > 1 ? 's were' : ' was'} skipped. ` : ''}Check these:`, list: problems }
        : { kind: 'ok', text: summary });
      onSaved();
    } catch (e) {
      setMsg({ kind: 'bad', text: `Couldn't read ${file.name}. ${errorText(e)}` });
    }
  }

  const shown = players.filter(p => filter === 'ALL' || p.role === filter);

  return (
    <section className="panel card">
      <div className="row-between"><h2 style={{ margin: 0 }}>Player sheet</h2><span className="empty num">{players.length} players</span></div>
      {isOwner && (
        <>
          <div className={`drop${over ? ' over' : ''}`}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            <div className="txt">
              <b>{players.length ? 'Replace the player sheet' : 'Upload the player sheet'} (.xlsx or .csv)</b>
              <span className="empty">Players come up in the Order column. Columns:</span>
              <div className="cols"><code>Player</code><code>Role</code><code>Base price</code><code className="opt">Order</code><code className="opt">Country</code><code className="opt">Photo</code><code className="opt">any stats…</code></div>
            </div>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Choose file</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { load(e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn" onClick={() => downloadTemplate().catch(e => setMsg({ kind: 'bad', text: errorText(e) }))}>Download template</button>
          </div>
          <span className="hint">Role: Batter, Bowler, All-rounder or Wicketkeeper (or BAT, BOWL, AR, WK). Base price in lakh, or written like "2 Cr" or "50 L". Photo is a web link to a picture (a Google Drive link works if the file is shared with "Anyone with the link"). Any other column, such as Matches, Runs, Wickets or Average, shows on the player card as a stat. Uploading again replaces the list.</span>
        </>
      )}
      {msg && <div className={`msg ${msg.kind}`}>{msg.kind === '' && msg.text.includes('\n') ? <pre className="pre">{msg.text}</pre> : msg.text}
        {msg.list && msg.list.length > 0 && <ul>{msg.list.slice(0, 10).map((l, i) => <li key={i}>{l}</li>)}</ul>}</div>}
      {players.length > 0 && (
        <>
          <div className="row-between">
          <div className="filters">
            {(['ALL', 'BAT', 'BOWL', 'AR', 'WK'] as const).map(f => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'ALL' ? 'All' : ROLE[f] + 's'}</button>
            ))}
          </div>
          <button className="btn" onClick={() => downloadPlayers(players, a.name).catch(e => setMsg({ kind: 'bad', text: errorText(e) }))}>{isOwner ? 'Download this list to edit' : 'Download player list'}</button>
          </div>
          <div className="tablewrap tall">
            <table>
              <thead><tr><th>Order</th><th>Player</th><th>Role</th><th className="r">Base price</th><th>Country</th><th>Stats</th></tr></thead>
              <tbody>{shown.map(p => (
                <tr key={p.id}>
                  <td className="num">{p.order_no}</td>
                  <td><span className="who-cell"><Avatar p={p} size={30} /><b>{p.name}</b></span></td>
                  <td>{ROLE[p.role]}</td><td className="r num">{fmt(p.base_price)}</td><td>{p.country || '–'}</td>
                  <td className="empty">{p.stats?.length ? p.stats.map(s => `${s.label} ${s.value}`).join(' · ') : '–'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      {!players.length && !isOwner && <p className="empty">The admin hasn't uploaded the player list yet.</p>}
    </section>
  );
}
