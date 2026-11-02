import type { CaptainPick, CaptainWindow, Match, Player, PlayerScore, Team } from './types';

export type RuleKey =
  | 'playing' | 'run' | 'four' | 'six' | 'half_century' | 'century' | 'duck'
  | 'wicket' | 'four_wickets' | 'five_wickets' | 'maiden'
  | 'catch' | 'stumping' | 'run_out'
  | 'captain' | 'vice' | 'missed_pick';

export const DEFAULT_RULES: Record<RuleKey, number> = {
  playing: 4, run: 1, four: 1, six: 2, half_century: 4, century: 8, duck: -3,
  wicket: 25, four_wickets: 4, five_wickets: 8, maiden: 4,
  catch: 8, stumping: 12, run_out: 10,
  captain: 2, vice: 1.5, missed_pick: 0,
};

export const RULE_GROUPS: { title: string; rules: { key: RuleKey; label: string; hint?: string }[] }[] = [
  { title: 'Batting', rules: [
    { key: 'playing', label: 'In the playing XI' },
    { key: 'run', label: 'Per run' },
    { key: 'four', label: 'Bonus per four' },
    { key: 'six', label: 'Bonus per six' },
    { key: 'half_century', label: '50 runs bonus', hint: 'Not added when the batter reaches 100' },
    { key: 'century', label: '100 runs bonus' },
    { key: 'duck', label: 'Out for 0', hint: 'Use a minus number. Not applied to bowlers' },
  ] },
  { title: 'Bowling', rules: [
    { key: 'wicket', label: 'Per wicket' },
    { key: 'four_wickets', label: '4-wicket bonus', hint: '5 or more wickets gets the 5-wicket bonus instead' },
    { key: 'five_wickets', label: '5-wicket bonus' },
    { key: 'maiden', label: 'Per maiden over' },
  ] },
  { title: 'Fielding', rules: [
    { key: 'catch', label: 'Per catch' },
    { key: 'stumping', label: 'Per stumping' },
    { key: 'run_out', label: 'Per run out' },
  ] },
  { title: 'Captain picks', rules: [
    { key: 'captain', label: 'Captain multiplier', hint: '2 means the captain scores double' },
    { key: 'vice', label: 'Vice-captain multiplier', hint: '1.5 means one and a half times' },
    { key: 'missed_pick', label: 'Missed the pick deadline', hint: 'Taken off the team total. Use a minus number agreed by the group; 0 means no penalty' },
  ] },
];

export function rulesOf(raw: Record<string, number> | null | undefined): Record<RuleKey, number> {
  const r = { ...DEFAULT_RULES };
  if (raw) for (const k of Object.keys(DEFAULT_RULES) as RuleKey[]) if (typeof raw[k] === 'number') r[k] = raw[k];
  return r;
}

export interface Breakdown { total: number; parts: { label: string; pts: number }[] }

export function calcPoints(s: PlayerScore | undefined, p: Pick<Player, 'role'>, raw: Record<string, number>): Breakdown {
  if (!s || !s.played) return { total: 0, parts: [] };
  const r = rulesOf(raw);
  const parts: { label: string; pts: number }[] = [];
  const add = (label: string, pts: number) => { if (pts) parts.push({ label, pts }); };
  add('Playing XI', r.playing);
  add(`${s.runs} run${s.runs === 1 ? '' : 's'}`, s.runs * r.run);
  add(`${s.fours} four${s.fours === 1 ? '' : 's'}`, s.fours * r.four);
  add(`${s.sixes} six${s.sixes === 1 ? '' : 'es'}`, s.sixes * r.six);
  if (s.runs >= 100) add('Century', r.century); else if (s.runs >= 50) add('Fifty', r.half_century);
  if (s.out && s.runs === 0 && p.role !== 'BOWL') add('Duck', r.duck);
  add(`${s.wickets} wicket${s.wickets === 1 ? '' : 's'}`, s.wickets * r.wicket);
  if (s.wickets >= 5) add('5-wicket haul', r.five_wickets); else if (s.wickets >= 4) add('4-wicket haul', r.four_wickets);
  add(`${s.maidens} maiden${s.maidens === 1 ? '' : 's'}`, s.maidens * r.maiden);
  add(`${s.catches} catch${s.catches === 1 ? '' : 'es'}`, s.catches * r.catch);
  add(`${s.stumpings} stumping${s.stumpings === 1 ? '' : 's'}`, s.stumpings * r.stumping);
  add(`${s.run_outs} run out${s.run_outs === 1 ? '' : 's'}`, s.run_outs * r.run_out);
  const total = Math.round(parts.reduce((t, x) => t + x.pts, 0) * 10) / 10;
  return { total, parts };
}

/** Short summary of a player's match, e.g. "104 (10×4, 3×6) · 1 wkt · 1 ct". */
export function figures(s: PlayerScore | undefined): string {
  if (!s) return 'No score yet';
  if (!s.played) return 'Did not play';
  const bits: string[] = [];
  if (s.runs || s.out || s.fours || s.sixes) {
    const extra = [s.fours ? `${s.fours}×4` : '', s.sixes ? `${s.sixes}×6` : ''].filter(Boolean).join(', ');
    bits.push(s.out && s.runs === 0 ? 'duck' : `${s.runs}${s.out ? '' : '*'}${extra ? ` (${extra})` : ''}`);
  }
  if (s.wickets) bits.push(`${s.wickets} wkt${s.wickets > 1 ? 's' : ''}`);
  if (s.maidens) bits.push(`${s.maidens} maiden${s.maidens > 1 ? 's' : ''}`);
  if (s.catches) bits.push(`${s.catches} ct`);
  if (s.stumpings) bits.push(`${s.stumpings} st`);
  if (s.run_outs) bits.push(`${s.run_outs} run out${s.run_outs > 1 ? 's' : ''}`);
  return bits.join(' · ') || 'Played';
}

/** One player's points in one match. */
export interface MatchLine { m: Match | null; s: PlayerScore; b: Breakdown }
/** A player's line on the leaderboard: one match, or the series so far. */
export interface PlayerLine { p: Player; s?: PlayerScore; b: Breakdown; per: MatchLine[] }

/** Series summary, e.g. "3 matches · 154 runs · 3 wkts · 2 ct". */
export function seriesFigures(per: MatchLine[]): string {
  const played = per.filter(x => x.s.played);
  if (!per.length) return 'No score yet';
  if (!played.length) return 'Did not play';
  const sum = (k: keyof PlayerScore) => played.reduce((t, x) => t + (Number(x.s[k]) || 0), 0);
  const bits = [`${played.length} match${played.length > 1 ? 'es' : ''}`];
  const runs = sum('runs'), w = sum('wickets'), c = sum('catches'), st = sum('stumpings'), ro = sum('run_outs');
  if (runs || played.some(x => x.s.out)) bits.push(`${runs} run${runs === 1 ? '' : 's'}`);
  if (w) bits.push(`${w} wkt${w > 1 ? 's' : ''}`);
  if (c) bits.push(`${c} ct`);
  if (st) bits.push(`${st} st`);
  if (ro) bits.push(`${ro} run out${ro > 1 ? 's' : ''}`);
  return bits.join(' · ');
}

/** Captain picks the leaderboard uses. Picks only count once their deadline has passed. */
export interface CaptainData { windows: CaptainWindow[]; picks: CaptainPick[]; now: number }
export type CapRole = 'C' | 'VC';

/** The pick round that applies to a match (the latest one starting at or before it, deadline passed). */
export function windowFor(cap: CaptainData | undefined, matchNo: number): CaptainWindow | null {
  if (!cap) return null;
  return cap.windows
    .filter(w => new Date(w.deadline).getTime() <= cap.now && w.from_match_no <= matchNo)
    .sort((x, y) => y.from_match_no - x.from_match_no)[0] ?? null;
}
export function pickOf(cap: CaptainData | undefined, w: CaptainWindow | null, teamId: string | null | undefined): CaptainPick | null {
  if (!cap || !w || !teamId) return null;
  return cap.picks.find(p => p.window_id === w.id && p.team_id === teamId) ?? null;
}
export function roleIn(pick: CaptainPick | null, playerId: string): CapRole | null {
  if (!pick) return null;
  return pick.captain_id === playerId ? 'C' : pick.vice_id === playerId ? 'VC' : null;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Applies the captain (2x) or vice-captain (1.5x) multiplier to one match's points. */
export function withCaptain(b: Breakdown, role: CapRole | null, raw: Record<string, number>): Breakdown {
  if (!role || !b.total) return b;
  const r = rulesOf(raw);
  const mult = role === 'C' ? r.captain : r.vice;
  const extra = r1(b.total * mult - b.total);
  if (!extra) return b;
  return { total: r1(b.total + extra), parts: [...b.parts, { label: `${role === 'C' ? 'Captain' : 'Vice-captain'} ×${mult}`, pts: extra }] };
}

/**
 * Team standings. With matchId: that match only. Without: every match added up
 * (for a single-match auction that is simply the match). Captain picks and the
 * missed-deadline penalty are applied when `cap` is given.
 */
export function teamTotals(teams: Team[], players: Player[], scores: PlayerScore[], raw: Record<string, number>,
  matches: Match[] = [], matchId: string | null = null, cap?: CaptainData) {
  const mById = new Map(matches.map(m => [m.id, m]));
  const order = (x: MatchLine) => x.m?.match_no ?? 0;
  const byPlayer = new Map<string, PlayerScore[]>();
  for (const s of scores) {
    if (matchId && s.match_id !== matchId) continue;
    const list = byPlayer.get(s.player_id) ?? [];
    list.push(s); byPlayer.set(s.player_id, list);
  }
  const single = !!matchId || matches.length <= 1;
  const lineOf = (p: Player): PlayerLine => {
    const per = (byPlayer.get(p.id) ?? []).map(s => {
      const m = (s.match_id && mById.get(s.match_id)) || null;
      const role = roleIn(pickOf(cap, windowFor(cap, m?.match_no ?? 1), p.sold_to), p.id);
      return { m, s, b: withCaptain(calcPoints(s, p, raw), role, raw) };
    }).sort((x, y) => order(x) - order(y));
    if (single) {
      const one = per[0];
      return { p, s: one?.s, b: one?.b ?? { total: 0, parts: [] }, per };
    }
    const total = r1(per.reduce((t, x) => t + x.b.total, 0));
    return { p, b: { total, parts: per.map(x => ({ label: x.m?.title ?? 'Match', pts: x.b.total })) }, per };
  };
  const rules = rulesOf(raw);
  const cur = matchId ? mById.get(matchId) : null;
  // The pick shown next to names: the selected match's, or the latest one in force.
  const shownWindow = windowFor(cap, cur ? cur.match_no : Number.MAX_SAFE_INTEGER);
  const active = cap ? cap.windows.filter(w => new Date(w.deadline).getTime() <= cap.now) : [];
  return teams.map(t => {
    const squad = players.filter(p => p.sold_to === t.id).map(lineOf).sort((x, y) => y.b.total - x.b.total);
    const penalties: { label: string; pts: number }[] = [];
    if (!matchId && rules.missed_pick) {
      for (const w of active) {
        if (!pickOf(cap, w, t.id)?.auto) continue;
        const from = matches.find(m => m.match_no === w.from_match_no);
        penalties.push({ label: `Missed the captain deadline${w.from_match_no > 1 && from ? ` (from ${from.title})` : ''}`, pts: rules.missed_pick });
      }
    }
    const total = r1(squad.reduce((a, x) => a + x.b.total, 0) + penalties.reduce((a, x) => a + x.pts, 0));
    const byMatch: Record<string, number> = {};
    for (const x of squad) for (const l of x.per) if (l.m) byMatch[l.m.id] = r1((byMatch[l.m.id] ?? 0) + l.b.total);
    return { team: t, squad, total, byMatch, penalties, pick: pickOf(cap, shownWindow, t.id) };
  }).sort((x, y) => y.total - x.total);
}
