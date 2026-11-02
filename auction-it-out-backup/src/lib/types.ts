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
}

export interface Bid {
  id: number;
  auction_id: string;
  player_id: string;
  team_id: string;
  amount: number;
  created_at: string;
}

export interface PlayerScore {
  player_id: string;
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
