export type Role = 'BAT' | 'BOWL' | 'AR' | 'WK';
export type Level = { from: number; step: number };
export type Stat = { label: string; value: string };

export interface Auction {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  status: 'setup' | 'running' | 'paused' | 'completed';
  max_teams: number;
  purse: number;
  timer_seconds: number;
  increments: Level[];
  min_squad: number;
  max_squad: number;
  min_bowlers: number;
  min_allrounders: number;
  round: number;
  phase: 'idle' | 'gap' | 'live' | 'result';
  phase_ends_at: string | null;
  paused_remaining_ms: number | null;
  current_player_id: string | null;
  current_bid: number | null;
  leader_team_id: string | null;
  bid_count: number;
  points_rules: Record<string, number>;
  /** Video call link (undefined if the database hasn't been updated). */
  meet_url?: string | null;
  starts_at?: string | null;
  /** One match, or a whole series of matches with points added up. */
  format?: 'match' | 'series';
  created_at: string;
}

export interface Team {
  id: string;
  auction_id: string;
  user_id: string;
  name: string;
  color: string;
  purse_left: number;
  joined_at: string;
}

export interface Player {
  id: string;
  auction_id: string;
  order_no: number;
  name: string;
  role: Role;
  base_price: number;
  country: string | null;
  photo_url: string | null;
  stats: Stat[];
  status: 'pool' | 'live' | 'sold' | 'unsold' | 'skipped';
  sold_to: string | null;
  sold_price: number | null;
  sold_at: string | null;
  /** Other spellings seen on scorecards, remembered when the admin confirms a match. */
  aliases?: string[];
}

export interface Bid {
  id: number;
  auction_id: string;
  player_id: string;
  team_id: string;
  amount: number;
  created_at: string;
}

export interface Match {
  id: string;
  auction_id: string;
  match_no: number;
  title: string;
  starts_on: string | null;
  status: 'upcoming' | 'done';
  created_at: string;
  /** The scorecard text the admin pasted, kept so everyone can check it. */
  scorecard_text?: string | null;
  scorecard_url?: string | null;
  scored_by_name?: string | null;
  scored_at?: string | null;
  /** Set when figures were changed by hand after the scorecard was pasted. */
  edited_at?: string | null;
}

export interface PlayerScore {
  player_id: string;
  /** Missing only before the series update reaches the database. */
  match_id?: string;
  auction_id: string;
  played: boolean;
  runs: number;
  fours: number;
  sixes: number;
  out: boolean;
  wickets: number;
  maidens: number;
  catches: number;
  stumpings: number;
  run_outs: number;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  auction_id: string;
  user_id: string | null;
  team_id: string | null;
  author: string;
  body: string;
  kind: 'user' | 'system';
  created_at: string;
}

/** A captain/vice-captain pick round: from a match onwards, with a deadline. */
export interface CaptainWindow {
  id: string;
  auction_id: string;
  from_match_no: number;
  deadline: string;
  created_at: string;
}

/** A team's captain and vice-captain for one window. Other teams' picks load only after the deadline. */
export interface CaptainPick {
  window_id: string;
  team_id: string;
  auction_id: string;
  captain_id: string | null;
  vice_id: string | null;
  /** True when the team missed the deadline and the app picked its two most expensive players. */
  auto: boolean;
  picked_at: string;
}

/** Who has picked (without saying whom), for every team. */
export interface CaptainStatus { window_id: string; team_id: string; auto: boolean; picked_at: string }
