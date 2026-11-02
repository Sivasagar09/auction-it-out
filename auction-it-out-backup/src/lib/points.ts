import type { Match, Player, PlayerScore, Team } from './types';

export type RuleKey =
  | 'playing' | 'run' | 'four' | 'six' | 'half_century' | 'century' | 'duck'
  | 'wicket' | 'four_wickets' | 'five_wickets' | 'maiden'
  | 'catch' | 'stumping' | 'run_out';

export const DEFAULT_RULES: Record<RuleKey, number> = {
  playing: 4, run: 1, four: 1, six: 2, half_century: 4, century: 8, duck: -3,
  wicket: 25, four_wickets: 4, five_wickets: 8, maiden: 4,
  catch: 8, stumping: 12, run_out: 10,
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

/**
 * Team standings. With matchId: that match only. Without: every match added up
 * (for a single-match auction that is simply the match).
 */
export function teamTotals(teams: Team[], players: Player[], scores: PlayerScore[], raw: Record<string, number>,
  matches: Match[] = [], matchId: string | null = null) {
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
    const per = (byPlayer.get(p.id) ?? []).map(s => ({ m: (s.match_id && mById.get(s.match_id)) || null, s, b: calcPoints(s, p, raw) }))
      .sort((x, y) => order(x) - order(y));
    if (single) {
      const one = per[0];
      return { p, s: one?.s, b: one?.b ?? { total: 0, parts: [] }, per };
    }
    const total = Math.round(per.reduce((t, x) => t + x.b.total, 0) * 10) / 10;
    return { p, b: { total, parts: per.map(x => ({ label: x.m?.title ?? 'Match', pts: x.b.total })) }, per };
  };
  return teams.map(t => {
    const squad = players.filter(p => p.sold_to === t.id).map(lineOf).sort((x, y) => y.b.total - x.b.total);
    const total = Math.round(squad.reduce((a, x) => a + x.b.total, 0) * 10) / 10;
    const byMatch: Record<string, number> = {};
    for (const x of squad) for (const l of x.per) if (l.m) byMatch[l.m.id] = Math.round(((byMatch[l.m.id] ?? 0) + l.b.total) * 10) / 10;
    return { team: t, squad, total, byMatch };
  }).sort((x, y) => y.total - x.total);
}
