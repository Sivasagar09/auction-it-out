/**
 * Reads a cricket scorecard copied from a website (Ctrl+A, Ctrl+C on the
 * ESPNcricinfo "Full scorecard" page) and turns it into match figures, then
 * matches the names to the players in the auction.
 *
 * It copes with columns separated by tabs or spaces, a row spread over several
 * lines (name, then dismissal, then numbers), and a wicket count on its own line.
 */
import type { Player } from './types';

export interface Figures {
  played: boolean; runs: number; fours: number; sixes: number; out: boolean;
  wickets: number; maidens: number; catches: number; stumpings: number; run_outs: number;
}
export interface ScorecardPlayer extends Figures {
  name: string;
  team: string;
  /** e.g. "c Patel b Arshdeep Singh" or "did not bat" */
  how: string;
}
export interface ParsedScorecard {
  teams: string[];
  players: ScorecardPlayer[];
  /** Things the reader noticed but couldn't use, shown to the admin. */
  notes: string[];
}

const blank = (): Figures => ({ played: true, runs: 0, fours: 0, sixes: 0, out: false, wickets: 0, maidens: 0, catches: 0, stumpings: 0, run_outs: 0 });

const NUM = /^-?\d+(\.\d+)?$/;
const DISMISSAL = /^(c\s|c&b|c &|b\s|lbw|st\s|run out|not out|retired|hit wicket|handled|obstruct|timed out|absent|caught|bowled|stumped)/i;
const NOT_OUT = /^(not out|retired not out|retired hurt|absent)/i;

/** Lower-case letters only, single spaces: "Tim Seifert †" -> "tim seifert". */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, ' ').replace(/[†*]/g, ' ')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Clean display name: removes †, (c), (wk). */
const cleanName = (s: string) => s.replace(/\((c|wk|c\s*&\s*wk|vc)\)/gi, '').replace(/[†*]/g, '').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();

function tokens(line: string) {
  return line.split(/\t+|\s{2,}|\s(?=-?\d+(?:\.\d+)?(?:\s|$))/).map(t => t.trim()).filter(Boolean);
}

/** Split "Tim Seifert † c Patel b Arshdeep Singh" into name and dismissal. */
function splitNameAndHow(text: string): [string, string] {
  const m = text.match(/\s(c\s|c&b|c & b|b\s|lbw|st\s|run out|not out|retired|hit wicket|absent|timed out|obstructing)/i);
  if (m && m.index !== undefined) return [text.slice(0, m.index), text.slice(m.index + 1)];
  return [text, ''];
}

export function parseScorecard(raw: string): ParsedScorecard {
  const lines = raw.replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
  const notes: string[] = [];
  const innings: { team: string; batting: { name: string; how: string; n: number[] }[]; dnb: string[]; bowling: { name: string; n: number[] }[] }[] = [];
  let cur: (typeof innings)[number] | null = null;
  let section: 'none' | 'bat' | 'dnb' | 'bowl' = 'none';
  let buf: string[] = [];
  let lastTeam = '';

  const flushBat = () => {
    if (!cur || !buf.length) { buf = []; return; }
    const toks = buf.flatMap(tokens);
    const nums: number[] = [];
    while (toks.length && NUM.test(toks[toks.length - 1])) nums.unshift(Number(toks.pop()));
    const text = toks.join(' ').trim();
    if (nums.length >= 5 && text) {
      let name = buf[0], how = toks.slice(tokens(buf[0]).length).join(' ');
      if (buf.length === 1 || DISMISSAL.test(name) || !how) [name, how] = splitNameAndHow(text);
      cur.batting.push({ name: cleanName(name), how: how.trim(), n: nums });
    }
    buf = [];
  };
  const flushBowl = () => {
    if (!cur || !buf.length) { buf = []; return; }
    const toks = buf.flatMap(tokens);
    const name = toks.filter(t => !NUM.test(t)).join(' ');
    const nums = toks.filter(t => NUM.test(t)).map(Number);
    if (name && nums.length >= 4) cur.bowling.push({ name: cleanName(name), n: nums });
    buf = [];
  };

  for (const line of lines) {
    // Innings heading, e.g. "New Zealand  (20 ovs maximum)" or "India  (T: 199 runs from 20 ovs)"
    const head = line.match(/^(.+?)\s*\((\d+\s*ovs? maximum|T:\s*\d+.*|.*\bovs?\b.*)\)\s*$/i);
    if (head && !/^\d/.test(line)) {
      if (section === 'bat') flushBat(); if (section === 'bowl') flushBowl();
      lastTeam = head[1].replace(/\s+innings$/i, '').trim();
      section = 'none';
      continue;
    }
    if (/^batting\b/i.test(line)) {
      if (section === 'bowl') flushBowl();
      cur = { team: lastTeam || `Team ${innings.length + 1}`, batting: [], dnb: [], bowling: [] };
      innings.push(cur); section = 'bat'; buf = []; continue;
    }
    if (/^bowling\b/i.test(line)) { if (section === 'bat') flushBat(); section = 'bowl'; buf = []; continue; }
    if (/^(did not bat|yet to bat)/i.test(line)) {
      if (section === 'bat') flushBat();
      section = 'dnb';
      const rest = line.replace(/^(did not bat|yet to bat)\s*:?/i, '');
      if (rest.trim()) cur?.dnb.push(...rest.split(',').map(cleanName).filter(Boolean));
      continue;
    }
    if (/^(extras|total|fall of wickets)/i.test(line)) {
      if (section === 'bat') flushBat(); if (section === 'bowl') flushBowl();
      section = 'none'; continue;
    }
    if (section === 'bat') {
      // A new batter starts on a non-numeric, non-dismissal line once the previous row is complete.
      buf.push(line);
      const toks = buf.flatMap(tokens);
      let k = 0; for (let i = toks.length - 1; i >= 0 && NUM.test(toks[i]); i--) k++;
      if (k >= 5 && /\.\d+$|^-$/.test(toks[toks.length - 1] ?? '')) flushBat();
      else if (k >= 6) flushBat();
    } else if (section === 'bowl') {
      const isNumLine = tokens(line).every(t => NUM.test(t));
      if (!isNumLine && buf.length && buf.flatMap(tokens).some(t => NUM.test(t))) flushBowl();
      buf.push(line);
    } else if (section === 'dnb') {
      cur?.dnb.push(...line.split(',').map(cleanName).filter(Boolean));
    }
  }
  if (section === 'bat') flushBat(); if (section === 'bowl') flushBowl();

  // Build the player list: everyone who batted or didn't bat is in that team's XI.
  const byKey = new Map<string, ScorecardPlayer>();
  const teamOf: Record<string, string[]> = {};
  const add = (name: string, team: string, how: string) => {
    const key = normName(name);
    if (!key) return null;
    let p = byKey.get(key);
    if (!p) { p = { ...blank(), name, team, how }; byKey.set(key, p); (teamOf[team] ??= []).push(key); }
    return p;
  };
  innings.forEach(inn => {
    inn.batting.forEach(b => {
      const p = add(b.name, inn.team, b.how)!;
      const [runs, , m4a, m6a, , ] = b.n;
      if (b.n.length >= 6) { p.runs = b.n[0]; p.fours = b.n[3]; p.sixes = b.n[4]; }
      else { p.runs = runs; p.fours = m4a; p.sixes = m6a; } // R B 4s 6s SR
      p.out = !NOT_OUT.test(b.how);
    });
    inn.dnb.forEach(n => add(n, inn.team, 'did not bat'));
  });
  const teams = innings.map(i => i.team).filter((t, i, a) => a.indexOf(t) === i);

  // Fielders and bowlers belong to the other team.
  const findIn = (team: string | undefined, short: string): ScorecardPlayer | null => {
    const s = normName(short);
    if (!s) return null;
    const pool = [...byKey.values()].filter(p => !team || p.team === team);
    const exact = pool.find(p => normName(p.name) === s);
    if (exact) return exact;
    const sp = s.split(' ');
    const last = sp[sp.length - 1];
    const byLast = pool.filter(p => normName(p.name).split(' ').slice(-1)[0] === last || normName(p.name).endsWith(' ' + s));
    if (byLast.length === 1) return byLast[0];
    if (byLast.length > 1 && sp.length > 1) {
      const first = sp[0];
      const hit = byLast.find(p => normName(p.name).startsWith(first) || normName(p.name).split(' ').map(w => w[0]).join('').startsWith(first));
      if (hit) return hit;
    }
    const contains = pool.filter(p => normName(p.name).includes(s));
    return contains.length === 1 ? contains[0] : null;
  };

  innings.forEach(inn => {
    const fieldingTeam = teams.find(t => t !== inn.team);
    inn.bowling.forEach(b => {
      const p = findIn(fieldingTeam, b.name) ?? add(b.name, fieldingTeam ?? 'Unknown', 'bowled')!;
      // O M R W ...
      p.maidens = b.n[1] ?? 0;
      p.wickets = b.n[3] ?? 0;
    });
    inn.batting.forEach(b => {
      const how = b.how.replace(/[†]/g, '').replace(/\s+/g, ' ').trim();
      let m: RegExpMatchArray | null;
      if ((m = how.match(/^c\s*(?:&|and)\s*b\s+(.+)$/i))) {
        const f = findIn(fieldingTeam, m[1]); if (f) f.catches++; else notes.push(`Couldn't find the catcher in "${how}"`);
      } else if ((m = how.match(/^c\s+(.+?)\s+b\s+(.+)$/i))) {
        if (/^sub\b/i.test(m[1])) notes.push(`Catch by a substitute (${m[1]}) for ${b.name}: not counted`);
        else { const f = findIn(fieldingTeam, m[1]); if (f) f.catches++; else notes.push(`Couldn't find the catcher "${m[1]}"`); }
      } else if ((m = how.match(/^st\s+(.+?)\s+b\s+(.+)$/i))) {
        const f = findIn(fieldingTeam, m[1]); if (f) f.stumpings++; else notes.push(`Couldn't find the wicketkeeper "${m[1]}"`);
      } else if ((m = how.match(/^run out\s*\((.+)\)/i))) {
        m[1].split('/').forEach(n => {
          if (/^sub\b/i.test(n.trim())) { notes.push(`Run out by a substitute (${n.trim()}): not counted`); return; }
          const f = findIn(fieldingTeam, n); if (f) f.run_outs++; else notes.push(`Couldn't find the fielder "${n.trim()}" in a run out`);
        });
      }
    });
  });

  if (!innings.length) notes.push('No batting table found. Copy the whole "Full scorecard" page (Ctrl+A, then Ctrl+C) and paste it again.');
  return { teams, players: [...byKey.values()], notes };
}

// ---------------------------------------------------------------------
// Matching scorecard names to auction players
// ---------------------------------------------------------------------
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** 0..1, 1 = same name. Compares whole names and surnames. */
export function nameScore(a: string, b: string): number {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const whole = 1 - lev(x, y) / Math.max(x.length, y.length);
  const xs = x.split(' '), ys = y.split(' ');
  const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];
  const lastSim = 1 - lev(lastX, lastY) / Math.max(lastX.length, lastY.length);
  const firstSim = 1 - lev(xs[0], ys[0]) / Math.max(xs[0].length, ys[0].length);
  // Initials like "DP Conway" vs "Devon Conway"
  const initials = xs.length > 1 && xs[0].length <= 3 && ys[0].startsWith(xs[0][0]) ? 0.9 : 0;
  return Math.max(whole, lastSim > 0.85 ? (lastSim * 0.6 + Math.max(firstSim, initials) * 0.4) : 0);
}

export type MatchKind = 'exact' | 'close' | 'check' | 'none';
export interface MatchRow {
  sc: ScorecardPlayer;
  player: Player | null;
  kind: MatchKind;
  score: number;
}

/**
 * For each scorecard player, the best auction player:
 *  exact = same name or a remembered spelling; close = tiny spelling difference (auto);
 *  check = probably right, admin should confirm; none = not in the auction.
 */
export function matchPlayers(sc: ParsedScorecard, players: Player[]): MatchRow[] {
  const taken = new Set<string>();
  const rows: MatchRow[] = sc.players.map(s => {
    const key = normName(s.name);
    const exact = players.find(p => normName(p.name) === key || (p.aliases ?? []).some(a => normName(a) === key));
    if (exact) return { sc: s, player: exact, kind: 'exact' as MatchKind, score: 1 };
    let best: Player | null = null, bestScore = 0;
    for (const p of players) { const v = nameScore(s.name, p.name); if (v > bestScore) { bestScore = v; best = p; } }
    const kind: MatchKind = bestScore >= 0.86 ? 'close' : bestScore >= 0.7 ? 'check' : 'none';
    return { sc: s, player: kind === 'none' ? null : best, kind, score: bestScore };
  });
  // One auction player can only match one scorecard name: keep the best.
  rows.slice().sort((a, b) => b.score - a.score).forEach(r => {
    if (!r.player) return;
    if (taken.has(r.player.id)) { r.player = null; r.kind = 'none'; } else taken.add(r.player.id);
  });
  return rows;
}
