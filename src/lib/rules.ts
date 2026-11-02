import type { Auction, Level, Player, Role, Team } from './types';

export const ROLE: Record<Role, string> = { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicketkeeper' };

/** Amounts are stored in lakh. 100 lakh = Rs 1 crore. */
export function fmt(lakh: number | null | undefined): string {
  if (lakh == null) return '–';
  return lakh >= 100 ? `₹${+(lakh / 100).toFixed(2)} Cr` : `₹${lakh} L`;
}

export function stepFor(levels: Level[], amount: number): number {
  const sorted = [...levels].sort((a, b) => a.from - b.from);
  let step = sorted[0]?.step ?? 5;
  for (const l of sorted) if (amount >= l.from) step = l.step;
  return step;
}

export function nextBid(a: Auction): number | null {
  if (a.current_bid == null) return null;
  return a.leader_team_id ? a.current_bid + stepFor(a.increments, a.current_bid) : a.current_bid;
}

export function squadOf(team: Team, players: Player[]) {
  return players.filter(p => p.sold_to === team.id);
}

export function roleCounts(team: Team, players: Player[], extra?: Player) {
  const c: Record<Role, number> = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  squadOf(team, players).forEach(p => c[p.role]++);
  if (extra) c[extra.role]++;
  return c;
}

export function missingRoles(a: Auction, team: Team, players: Player[], extra?: Player) {
  const c = roleCounts(team, players, extra);
  return Math.max(a.min_bowlers - c.BOWL, 0) + Math.max(a.min_allrounders - c.AR, 0);
}

function minBase(players: Player[]) {
  return players.length ? Math.min(...players.map(p => p.base_price)) : 0;
}

export function reserveAfter(a: Auction, team: Team, players: Player[], p: Player) {
  const n = squadOf(team, players).length;
  return Math.max(a.min_squad - (n + 1), missingRoles(a, team, players, p), 0) * minBase(players);
}

/** Largest bid this team could make on player p (or on a typical player if p is missing). */
export function maxBidFor(a: Auction, team: Team, players: Player[], p?: Player | null) {
  const n = squadOf(team, players).length;
  if (n >= a.max_squad) return 0;
  const reserve = p
    ? reserveAfter(a, team, players, p)
    : Math.max(a.min_squad - n - 1, missingRoles(a, team, players) - 1, 0) * minBase(players);
  return Math.max(0, team.purse_left - reserve);
}

/** Mirrors the server's checks so the button can explain itself. The server has the final say. */
export function whyNot(a: Auction, team: Team, players: Player[]): string | null {
  if (a.status === 'paused') return 'The auction is paused';
  if (a.status !== 'running' || a.phase !== 'live') return 'Waiting for the next player';
  const p = players.find(x => x.id === a.current_player_id);
  if (!p) return 'Waiting for the next player';
  if (a.leader_team_id === team.id) return 'You are the highest bidder';
  const n = squadOf(team, players).length;
  if (n >= a.max_squad) return 'Your squad is full';
  const missing = missingRoles(a, team, players, p);
  if (missing > a.max_squad - (n + 1)) return 'Your remaining slots must go to the bowlers or all-rounders you still need';
  const amt = nextBid(a) ?? 0;
  if (amt > team.purse_left) return `Not enough purse left for ${fmt(amt)}`;
  const reserve = reserveAfter(a, team, players, p);
  if (amt > team.purse_left - reserve) return `Keep ${fmt(reserve)} to complete your squad`;
  return null;
}

/** Plain-language description of the increment levels, plus an example ladder. */
export function describeLevels(levels: Level[]) {
  const lv = [...levels].sort((a, b) => a.from - b.from);
  const lines = lv.map((l, i) => {
    const to = lv[i + 1]?.from;
    const range = i === 0 ? (to != null ? `Up to ${fmt(to)}` : 'All bids') : to != null ? `${fmt(l.from)} to ${fmt(to)}` : `${fmt(l.from)} and above`;
    return { range, step: `+${fmt(l.step)} per bid` };
  });
  let amt = 50;
  const ladder = [fmt(amt)];
  while (ladder.length < 12) { amt += stepFor(lv, amt); ladder.push(fmt(amt)); }
  return { lines, ladder };
}
