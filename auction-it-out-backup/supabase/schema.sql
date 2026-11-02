-- =====================================================================
-- Auction It Out: full database schema (Supabase / Postgres).
-- Generated from the live project on 2026-11-02. This is the current state
-- after updates 001-007; run it once in the SQL Editor of a NEW, empty
-- Supabase project to rebuild the database (no data is included).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables, keys, indexes, row level security
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id uuid not null
);

create table if not exists public.auctions (
  id uuid not null default gen_random_uuid(),
  name text not null,
  join_code text not null,
  owner_id uuid not null,
  status text not null default 'setup'::text,
  max_teams integer not null default 6,
  purse integer not null default 2000,
  timer_seconds integer not null default 12,
  increments jsonb not null default '[{"from": 0, "step": 5}, {"from": 100, "step": 10}]'::jsonb,
  min_squad integer not null default 3,
  max_squad integer not null default 8,
  min_bowlers integer not null default 1,
  min_allrounders integer not null default 1,
  round integer not null default 1,
  phase text not null default 'idle'::text,
  phase_ends_at timestamp with time zone,
  paused_remaining_ms integer,
  current_player_id uuid,
  current_bid integer,
  leader_team_id uuid,
  bid_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  points_rules jsonb not null default '{"run": 1, "six": 2, "duck": -3, "four": 1, "catch": 8, "maiden": 4, "wicket": 25, "century": 8, "playing": 4, "run_out": 10, "stumping": 12, "five_wickets": 8, "four_wickets": 4, "half_century": 4}'::jsonb,
  meet_url text,
  starts_at timestamp with time zone,
  format text not null default 'match'::text
);

create table if not exists public.bids (
  id bigint not null,
  auction_id uuid not null,
  player_id uuid not null,
  team_id uuid not null,
  amount integer not null,
  created_at timestamp with time zone not null default clock_timestamp()
);

create table if not exists public.chat_messages (
  id bigint not null,
  auction_id uuid not null,
  user_id uuid,
  team_id uuid,
  author text not null,
  body text not null,
  kind text not null default 'user'::text,
  created_at timestamp with time zone not null default clock_timestamp()
);

create table if not exists public.matches (
  id uuid not null default gen_random_uuid(),
  auction_id uuid not null,
  match_no integer not null,
  title text not null,
  starts_on date,
  status text not null default 'upcoming'::text,
  created_at timestamp with time zone not null default now(),
  scorecard_text text,
  scorecard_url text,
  scored_by uuid,
  scored_by_name text,
  scored_at timestamp with time zone,
  edited_at timestamp with time zone
);

create table if not exists public.player_scores (
  player_id uuid not null,
  auction_id uuid not null,
  played boolean not null default true,
  runs integer not null default 0,
  fours integer not null default 0,
  sixes integer not null default 0,
  "out" boolean not null default false,
  wickets integer not null default 0,
  maidens integer not null default 0,
  catches integer not null default 0,
  stumpings integer not null default 0,
  run_outs integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  match_id uuid not null
);

create table if not exists public.players (
  id uuid not null default gen_random_uuid(),
  auction_id uuid not null,
  order_no numeric not null,
  name text not null,
  role text not null,
  base_price integer not null,
  country text,
  status text not null default 'pool'::text,
  sold_to uuid,
  sold_price integer,
  sold_at timestamp with time zone,
  photo_url text,
  stats jsonb not null default '[]'::jsonb,
  aliases text[] not null default '{}'::text[]
);

create table if not exists public.teams (
  id uuid not null default gen_random_uuid(),
  auction_id uuid not null,
  user_id uuid not null,
  name text not null,
  color text not null,
  purse_left integer not null,
  joined_at timestamp with time zone not null default now()
);

alter table public.app_admins add constraint app_admins_pkey PRIMARY KEY (user_id);

alter table public.auctions add constraint auctions_format_check CHECK ((format = ANY (ARRAY['match'::text, 'series'::text])));

alter table public.auctions add constraint auctions_join_code_key UNIQUE (join_code);

alter table public.auctions add constraint auctions_max_squad_check CHECK ((max_squad >= 1));

alter table public.auctions add constraint auctions_max_teams_check CHECK (((max_teams >= 2) AND (max_teams <= 20)));

alter table public.auctions add constraint auctions_min_allrounders_check CHECK ((min_allrounders >= 0));

alter table public.auctions add constraint auctions_min_bowlers_check CHECK ((min_bowlers >= 0));

alter table public.auctions add constraint auctions_min_squad_check CHECK ((min_squad >= 0));

alter table public.auctions add constraint auctions_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));

alter table public.auctions add constraint auctions_phase_check CHECK ((phase = ANY (ARRAY['idle'::text, 'gap'::text, 'live'::text, 'result'::text])));

alter table public.auctions add constraint auctions_pkey PRIMARY KEY (id);

alter table public.auctions add constraint auctions_purse_check CHECK ((purse > 0));

alter table public.auctions add constraint auctions_status_check CHECK ((status = ANY (ARRAY['setup'::text, 'running'::text, 'paused'::text, 'completed'::text])));

alter table public.auctions add constraint auctions_timer_seconds_check CHECK (((timer_seconds >= 3) AND (timer_seconds <= 120)));

alter table public.bids add constraint bids_pkey PRIMARY KEY (id);

alter table public.chat_messages add constraint chat_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)));

alter table public.chat_messages add constraint chat_messages_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'system'::text])));

alter table public.chat_messages add constraint chat_messages_pkey PRIMARY KEY (id);

alter table public.matches add constraint matches_auction_id_match_no_key UNIQUE (auction_id, match_no);

alter table public.matches add constraint matches_match_no_check CHECK (((match_no >= 1) AND (match_no <= 30)));

alter table public.matches add constraint matches_pkey PRIMARY KEY (id);

alter table public.matches add constraint matches_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'done'::text])));

alter table public.matches add constraint matches_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 60)));

alter table public.player_scores add constraint player_scores_catches_check CHECK ((catches >= 0));

alter table public.player_scores add constraint player_scores_fours_check CHECK ((fours >= 0));

alter table public.player_scores add constraint player_scores_maidens_check CHECK ((maidens >= 0));

alter table public.player_scores add constraint player_scores_pkey PRIMARY KEY (player_id, match_id);

alter table public.player_scores add constraint player_scores_run_outs_check CHECK ((run_outs >= 0));

alter table public.player_scores add constraint player_scores_runs_check CHECK ((runs >= 0));

alter table public.player_scores add constraint player_scores_sixes_check CHECK ((sixes >= 0));

alter table public.player_scores add constraint player_scores_stumpings_check CHECK ((stumpings >= 0));

alter table public.player_scores add constraint player_scores_wickets_check CHECK (((wickets >= 0) AND (wickets <= 10)));

alter table public.players add constraint players_base_price_check CHECK ((base_price > 0));

alter table public.players add constraint players_pkey PRIMARY KEY (id);

alter table public.players add constraint players_role_check CHECK ((role = ANY (ARRAY['BAT'::text, 'BOWL'::text, 'AR'::text, 'WK'::text])));

alter table public.players add constraint players_status_check CHECK ((status = ANY (ARRAY['pool'::text, 'live'::text, 'sold'::text, 'unsold'::text, 'skipped'::text])));

alter table public.teams add constraint teams_auction_id_name_key UNIQUE (auction_id, name);

alter table public.teams add constraint teams_auction_id_user_id_key UNIQUE (auction_id, user_id);

alter table public.teams add constraint teams_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40)));

alter table public.teams add constraint teams_pkey PRIMARY KEY (id);

alter table public.app_admins add constraint app_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.auctions add constraint auctions_current_player_fk FOREIGN KEY (current_player_id) REFERENCES players(id) ON DELETE SET NULL;

alter table public.auctions add constraint auctions_leader_fk FOREIGN KEY (leader_team_id) REFERENCES teams(id) ON DELETE SET NULL;

alter table public.auctions add constraint auctions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.bids add constraint bids_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.bids add constraint bids_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

alter table public.bids add constraint bids_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

alter table public.chat_messages add constraint chat_messages_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.chat_messages add constraint chat_messages_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

alter table public.chat_messages add constraint chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.matches add constraint matches_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.player_scores add constraint player_scores_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.player_scores add constraint player_scores_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;

alter table public.player_scores add constraint player_scores_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

alter table public.players add constraint players_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.players add constraint players_sold_to_fkey FOREIGN KEY (sold_to) REFERENCES teams(id) ON DELETE SET NULL;

alter table public.teams add constraint teams_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

alter table public.teams add constraint teams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX bids_auction_id_id_idx ON public.bids USING btree (auction_id, id DESC);

CREATE INDEX chat_messages_auction ON public.chat_messages USING btree (auction_id, id DESC);

CREATE INDEX player_scores_auction ON public.player_scores USING btree (auction_id);

CREATE INDEX player_scores_match ON public.player_scores USING btree (match_id);

CREATE INDEX players_auction_id_status_order_no_idx ON public.players USING btree (auction_id, status, order_no);

alter table public.app_admins enable row level security;

alter table public.auctions enable row level security;

alter table public.bids enable row level security;

alter table public.chat_messages enable row level security;

alter table public.matches enable row level security;

alter table public.player_scores enable row level security;

alter table public.players enable row level security;

alter table public.teams enable row level security;

-- ---------------------------------------------------------------------
-- Functions (all writes go through these)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_team_count(p_auction uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from teams t, auctions a
  where t.auction_id = p_auction and a.id = p_auction
    and (select count(*) from players p where p.sold_to = t.id) < a.max_squad
    and t.purse_left >= coalesce((select min(base_price) from players p
                                  where p.auction_id = p_auction and p.status in ('pool','live')), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then
    raise exception 'Only the app owner can see this';
  end if;
  return jsonb_build_object(
    'users', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', coalesce(u.raw_user_meta_data->>'full_name', ''),
        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'created', (select count(*) from auctions a where a.owner_id = u.id),
        'joined', (select count(*) from teams t where t.user_id = u.id)) order by u.created_at desc), '[]'::jsonb)
      from auth.users u),
    'auctions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'format', a.format, 'status', a.status, 'created_at', a.created_at,
        'join_code', a.join_code, 'owner_email', u.email, 'owner_name', coalesce(u.raw_user_meta_data->>'full_name', ''),
        'teams', (select count(*) from teams t where t.auction_id = a.id),
        'players', (select count(*) from players p where p.auction_id = a.id),
        'matches', (select count(*) from matches m where m.auction_id = a.id)) order by a.created_at desc), '[]'::jsonb)
      from auctions a left join auth.users u on u.id = a.owner_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.advance_auction(p_auction uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; p players; now_ts timestamptz := clock_timestamp();
begin
  if not is_member(p_auction) then raise exception 'You are not part of this auction'; end if;
  select * into a from auctions where id = p_auction for update;
  if a.status <> 'running' or a.phase_ends_at is null or now_ts < a.phase_ends_at then
    return a.phase;
  end if;

  if a.phase = 'gap' then
    select * into p from players where auction_id = p_auction and status = 'pool'
      order by order_no, name limit 1;
    if not found or active_team_count(p_auction) = 0 then
      perform finish_auction(p_auction);
      return 'completed';
    end if;
    update players set status = 'live' where id = p.id;
    update auctions set phase = 'live', current_player_id = p.id, current_bid = p.base_price,
      leader_team_id = null, bid_count = 0,
      phase_ends_at = now_ts + make_interval(secs => a.timer_seconds + 5)
    where id = p_auction;
    return 'live';

  elsif a.phase = 'live' then
    if a.leader_team_id is not null then
      update players set status = 'sold', sold_to = a.leader_team_id, sold_price = a.current_bid, sold_at = now_ts
        where id = a.current_player_id;
      update teams set purse_left = purse_left - a.current_bid where id = a.leader_team_id;
    else
      update players set status = 'unsold' where id = a.current_player_id;
    end if;
    update auctions set phase = 'result', phase_ends_at = now_ts + interval '4 seconds' where id = p_auction;
    return 'result';

  else
    if not exists (select 1 from players where auction_id = p_auction and status = 'pool')
       or active_team_count(p_auction) = 0 then
      perform finish_auction(p_auction);
      return 'completed';
    end if;
    update auctions set phase = 'gap', phase_ends_at = now_ts + interval '3 seconds' where id = p_auction;
    return 'gap';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.auction_first_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into matches (auction_id, match_no, title) values (new.id, 1, 'Match 1') on conflict do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.chat_on_auction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_body text;
begin
  if new.status = old.status then return new; end if;
  v_body := case
    when old.status = 'setup' and new.status = 'running' then 'The auction has started. Good luck, everyone!'
    when old.status = 'completed' and new.status = 'running' then 'Round for unsold players has started'
    when new.status = 'paused' then 'The admin paused the auction'
    when old.status = 'paused' and new.status = 'running' then 'The auction has resumed'
    when new.status = 'completed' then 'The auction has closed'
    when new.status = 'setup' then 'The admin reset the auction to setup'
  end;
  if v_body is not null then
    insert into chat_messages (auction_id, author, body, kind) values (new.id, 'Auction', v_body, 'system');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.chat_on_player_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_team text;
begin
  if new.status = old.status then return new; end if;
  if new.status = 'sold' then
    select name into v_team from teams where id = new.sold_to;
    insert into chat_messages (auction_id, author, body, kind)
    values (new.auction_id, 'Auction', new.name || ' sold to ' || coalesce(v_team, 'a team') || ' for ' || fmt_lakh(new.sold_price), 'system');
  elsif new.status = 'unsold' and old.status = 'live' then
    insert into chat_messages (auction_id, author, body, kind)
    values (new.auction_id, 'Auction', new.name || ' goes unsold', 'system');
  elsif new.status = 'skipped' then
    insert into chat_messages (auction_id, author, body, kind)
    values (new.auction_id, 'Auction', new.name || ' was skipped by the admin', 'system');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_auction(p_name text, p_team_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Give the auction a name'; end if;
  loop
    v_code := upper(substr(translate(encode(gen_random_bytes(6),'base64'),'+/=0O1lI','XYZABCDE'),1,6));
    exit when not exists (select 1 from auctions where join_code = v_code);
  end loop;
  insert into auctions (name, join_code, owner_id) values (trim(p_name), v_code, auth.uid()) returning id into v_id;
  if coalesce(trim(p_team_name),'') <> '' then
    insert into teams (auction_id, user_id, name, color, purse_left)
    values (v_id, auth.uid(), trim(p_team_name), (team_colors())[1], 2000);
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_owner(p_auction);
  delete from auctions where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_message(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m chat_messages;
begin
  select * into m from chat_messages where id = p_id;
  if not found then return; end if;
  if m.user_id is distinct from auth.uid()
     and not exists (select 1 from auctions where id = m.auction_id and owner_id = auth.uid()) then
    raise exception 'You can only delete your own messages';
  end if;
  delete from chat_messages where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.end_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  if a.status not in ('running','paused') then raise exception 'The auction is not running'; end if;
  if a.phase = 'live' and a.leader_team_id is not null then
    update players set status = 'sold', sold_to = a.leader_team_id, sold_price = a.current_bid, sold_at = clock_timestamp()
      where id = a.current_player_id;
    update teams set purse_left = purse_left - a.current_bid where id = a.leader_team_id;
  end if;
  perform finish_auction(p_auction);
end $function$
;

CREATE OR REPLACE FUNCTION public.find_auction(p_code text)
 RETURNS TABLE(id uuid, name text, status text, teams integer, max_teams integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.name, a.status, (select count(*)::int from teams t where t.auction_id = a.id), a.max_teams
  from auctions a where a.join_code = upper(trim(p_code));
$function$
;

CREATE OR REPLACE FUNCTION public.finish_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update players set status = 'unsold' where auction_id = p_auction and status in ('pool','live');
  update auctions set status = 'completed', phase = 'idle', phase_ends_at = null, paused_remaining_ms = null,
    current_player_id = null, current_bid = null, leader_team_id = null where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.fmt_lakh(p integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p >= 100 then '₹' || trim(trailing '.' from trim(trailing '0' from to_char(p / 100.0, 'FM999990.00'))) || ' Cr'
              else '₹' || p || ' L' end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_scorecard(p_auction uuid, p_match uuid, p_rows jsonb, p_text text, p_url text, p_aliases jsonb, p_done boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; m matches; n int; x jsonb; v_url text := nullif(trim(coalesce(p_url, '')), ''); v_by text;
begin
  a := require_owner(p_auction);
  select * into m from matches where id = p_match and auction_id = p_auction for update;
  if not found then raise exception 'That match is not part of this auction'; end if;
  if char_length(coalesce(p_text, '')) < 20 then raise exception 'Paste the whole scorecard first'; end if;
  if char_length(p_text) > 100000 then raise exception 'That scorecard text is too long'; end if;
  if v_url is not null and v_url !~* '^https?://[^\s<>"]+$' then raise exception 'The scorecard link should start with https://'; end if;

  n := write_match_scores(p_auction, p_match, p_rows);

  for x in select * from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) loop
    update players set aliases = array_append(aliases, left(trim(x->>'alias'), 80))
    where id = (x->>'player_id')::uuid and auction_id = p_auction
      and trim(coalesce(x->>'alias', '')) <> ''
      and lower(name) <> lower(trim(x->>'alias'))
      and not (lower(trim(x->>'alias')) = any (select lower(unnest(aliases))));
  end loop;

  select coalesce(t.name, nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'The admin')
    into v_by from auth.users u left join teams t on t.user_id = u.id and t.auction_id = p_auction where u.id = auth.uid();

  update matches set scorecard_text = p_text, scorecard_url = v_url, scored_by = auth.uid(), scored_by_name = v_by,
    scored_at = now(), edited_at = null, status = case when p_done then 'done' else status end
  where id = p_match;

  insert into chat_messages (auction_id, author, body, kind)
  values (p_auction, 'Auction',
    'Scorecard for ' || m.title || ' posted by ' || v_by || '. Points are updated'
      || case when p_done and a.format = 'series' then ' and the match is final' else '' end
      || '. Open the leaderboard to see the original scorecard.', 'system');
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.increment_for(p_increments jsonb, p_amount integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select (e->>'step')::int from jsonb_array_elements(p_increments) e
      where (e->>'from')::int <= p_amount order by (e->>'from')::int desc limit 1),
    (select (e->>'step')::int from jsonb_array_elements(p_increments) e
      order by (e->>'from')::int asc limit 1),
    5);
$function$
;

CREATE OR REPLACE FUNCTION public.is_member(p_auction uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from auctions a where a.id = p_auction and a.owner_id = auth.uid())
      or exists (select 1 from teams t where t.auction_id = p_auction and t.user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.join_auction(p_code text, p_team_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; n int; used text[]; c text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into a from auctions where join_code = upper(trim(p_code)) for update;
  if not found then raise exception 'No auction found with code %', upper(trim(p_code)); end if;
  if exists (select 1 from teams where auction_id = a.id and user_id = auth.uid()) then return a.id; end if;
  if a.status <> 'setup' then raise exception 'This auction has already started, so new teams can''t join'; end if;
  if coalesce(trim(p_team_name),'') = '' then raise exception 'Enter a team name'; end if;
  select count(*), array_agg(color) into n, used from teams where auction_id = a.id;
  if n >= a.max_teams then raise exception 'This auction is full (% of % teams)', n, a.max_teams; end if;
  if exists (select 1 from teams where auction_id = a.id and lower(name) = lower(trim(p_team_name))) then
    raise exception 'The team name "%" is taken', trim(p_team_name);
  end if;
  select col into c from unnest(team_colors()) with ordinality u(col, i)
    where col <> all (coalesce(used, '{}')) order by i limit 1;
  insert into teams (auction_id, user_id, name, color, purse_left)
  values (a.id, auth.uid(), trim(p_team_name), coalesce(c,'#6B7A99'), a.purse);
  return a.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.owner_join(p_auction uuid, p_team_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  perform join_auction(a.join_code, p_team_name);
end $function$
;

CREATE OR REPLACE FUNCTION public.pause_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  if a.status <> 'running' then raise exception 'The auction is not running'; end if;
  update auctions set status = 'paused',
    paused_remaining_ms = greatest(0, (extract(epoch from (phase_ends_at - clock_timestamp())) * 1000)::int)
  where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.place_bid(p_auction uuid, p_expected integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a auctions; t teams; p players; now_ts timestamptz;
  v_next int; v_squad int; v_bowl int; v_ar int; v_missing int; v_slots_left int; v_min_base int; v_reserve int;
begin
  select * into a from auctions where id = p_auction for update;
  if not found then raise exception 'Auction not found'; end if;
  now_ts := clock_timestamp();
  if a.status = 'paused' then raise exception 'The auction is paused'; end if;
  if a.status <> 'running' or a.phase <> 'live' then raise exception 'Bidding is not open right now'; end if;
  if now_ts >= a.phase_ends_at then raise exception 'Too late: the timer ran out'; end if;

  select * into t from teams where auction_id = p_auction and user_id = auth.uid();
  if not found then raise exception 'You don''t have a team in this auction'; end if;
  if a.leader_team_id = t.id then raise exception 'You are already the highest bidder'; end if;

  select * into p from players where id = a.current_player_id;
  v_next := case when a.leader_team_id is null then a.current_bid
                 else a.current_bid + increment_for(a.increments, a.current_bid) end;
  if p_expected is not null and p_expected <> v_next then
    raise exception 'Someone bid first. The next bid is now %', v_next using errcode = 'P0002';
  end if;

  select count(*), count(*) filter (where role = 'BOWL'), count(*) filter (where role = 'AR')
    into v_squad, v_bowl, v_ar
    from players where sold_to = t.id;
  if v_squad >= a.max_squad then raise exception 'Your squad is full'; end if;

  v_missing := greatest(a.min_bowlers - v_bowl - (p.role = 'BOWL')::int, 0)
             + greatest(a.min_allrounders - v_ar - (p.role = 'AR')::int, 0);
  v_slots_left := a.max_squad - (v_squad + 1);
  if v_missing > v_slots_left then
    raise exception 'Your remaining squad slots must go to the bowlers or all-rounders you still need';
  end if;

  if v_next > t.purse_left then raise exception 'Not enough purse left for this bid'; end if;
  select min(base_price) into v_min_base from players where auction_id = p_auction;
  v_reserve := greatest(a.min_squad - (v_squad + 1), v_missing, 0) * v_min_base;
  if v_next > t.purse_left - v_reserve then
    raise exception 'You must keep % lakh to complete your squad', v_reserve;
  end if;

  insert into bids (auction_id, player_id, team_id, amount) values (p_auction, p.id, t.id, v_next);
  update auctions set current_bid = v_next, leader_team_id = t.id, bid_count = bid_count + 1,
    phase_ends_at = now_ts + make_interval(secs => a.timer_seconds)
  where id = p_auction;
  return v_next;
end $function$
;

CREATE OR REPLACE FUNCTION public.post_message(p_auction uuid, p_body text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t teams; a auctions; v_author text; v_id bigint; v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not is_member(p_auction) then raise exception 'You are not part of this auction'; end if;
  if v_body = '' then raise exception 'Type a message first'; end if;
  if char_length(v_body) > 500 then raise exception 'Messages can be up to 500 characters'; end if;
  if (select count(*) from chat_messages where auction_id = p_auction and user_id = auth.uid()
        and created_at > clock_timestamp() - interval '10 seconds') >= 8 then
    raise exception 'Slow down a little: too many messages in a few seconds';
  end if;
  select * into t from teams where auction_id = p_auction and user_id = auth.uid();
  select * into a from auctions where id = p_auction;
  if t.id is not null then
    v_author := t.name;
  else
    select coalesce(nullif(raw_user_meta_data->>'full_name', ''), split_part(email, '@', 1)) into v_author
      from auth.users where id = auth.uid();
    v_author := coalesce(v_author, 'Someone') || case when a.owner_id = auth.uid() then ' (admin)' else '' end;
  end if;
  insert into chat_messages (auction_id, user_id, team_id, author, body)
  values (p_auction, auth.uid(), t.id, v_author, v_body) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.remove_team(p_team uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t teams; a auctions;
begin
  select * into t from teams where id = p_team;
  if not found then return; end if;
  select * into a from auctions where id = t.auction_id for update;
  if a.owner_id is distinct from auth.uid() and t.user_id is distinct from auth.uid() then raise exception 'You can''t remove this team'; end if;
  if a.status <> 'setup' then raise exception 'Teams can''t be removed after the auction has started'; end if;
  delete from teams where id = p_team;
end $function$
;

CREATE OR REPLACE FUNCTION public.require_owner(p_auction uuid)
 RETURNS auctions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  select * into a from auctions where id = p_auction for update;
  if not found then raise exception 'Auction not found'; end if;
  if a.owner_id is distinct from auth.uid() then raise exception 'Only the auction admin can do this'; end if;
  return a;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  update auctions set status = 'setup', phase = 'idle', phase_ends_at = null, paused_remaining_ms = null,
    current_player_id = null, current_bid = null, leader_team_id = null, bid_count = 0, round = 1
  where id = p_auction;
  delete from bids where auction_id = p_auction;
  update players set status = 'pool', sold_to = null, sold_price = null, sold_at = null where auction_id = p_auction;
  update teams set purse_left = a.purse where auction_id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.resume_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  if a.status <> 'paused' then raise exception 'The auction is not paused'; end if;
  update auctions set status = 'running',
    phase_ends_at = clock_timestamp() + make_interval(secs => greatest(coalesce(paused_remaining_ms, 0), 3000) / 1000.0),
    paused_remaining_ms = null
  where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_match(p_match uuid, p_title text, p_starts_on date, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m matches; a auctions; v_title text := trim(coalesce(p_title, ''));
begin
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Match not found'; end if;
  a := require_owner(m.auction_id);
  if v_title = '' then v_title := m.title; end if;
  if char_length(v_title) > 60 then raise exception 'Match names can be up to 60 characters'; end if;
  update matches set title = v_title, starts_on = p_starts_on,
    status = case when p_done then 'done' else 'upcoming' end
  where id = p_match;
  if p_done and m.status <> 'done' and a.format = 'series' then
    insert into chat_messages (auction_id, author, body, kind)
    values (a.id, 'Auction', 'Scores for ' || v_title || ' are final. Check the series leaderboard!', 'system');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.server_now()
 RETURNS timestamp with time zone
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select clock_timestamp(); $function$
;

CREATE OR REPLACE FUNCTION public.set_auction_call(p_auction uuid, p_meet_url text, p_starts_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; v_url text := trim(coalesce(p_meet_url, ''));
begin
  select * into a from auctions where id = p_auction for update;
  if not found then raise exception 'Auction not found'; end if;
  if a.owner_id is distinct from auth.uid() then raise exception 'Only the admin can change the video call'; end if;

  if v_url = '' then
    v_url := null;
  else
    if v_url ~* '^[a-z]{3}-[a-z]{4}-[a-z]{3}$' then
      v_url := 'https://meet.google.com/' || lower(v_url);
    elsif v_url !~* '^https?://' then
      v_url := 'https://' || v_url;
    end if;
    v_url := regexp_replace(v_url, '^http://', 'https://', 'i');
    if v_url !~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/[^\s<>"]*)?$' or length(v_url) > 300 then
      raise exception 'That does not look like a meeting link. Paste the full link, for example https://meet.google.com/abc-defg-hij';
    end if;
  end if;

  update auctions set meet_url = v_url, starts_at = p_starts_at where id = p_auction;

  if v_url is not null and v_url is distinct from a.meet_url then
    insert into chat_messages (auction_id, author, body, kind)
    values (p_auction, 'Auction', 'The admin added a video call. Tap "Join video call" to see everyone live.', 'system');
  end if;
  return v_url;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_auction_format(p_auction uuid, p_format text, p_matches integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; v_count int; v_have int;
begin
  a := require_owner(p_auction);
  if p_format not in ('match', 'series') then raise exception 'Choose one match or a whole series'; end if;
  if p_format <> a.format and a.status <> 'setup' then
    raise exception 'You can only switch between one match and a series before the auction starts';
  end if;
  v_count := case when p_format = 'match' then 1 else coalesce(p_matches, 0) end;
  if p_format = 'series' and (v_count < 2 or v_count > 30) then
    raise exception 'A series needs between 2 and 30 matches';
  end if;

  if exists (select 1 from matches m join player_scores s on s.match_id = m.id
             where m.auction_id = p_auction and m.match_no > v_count) then
    raise exception 'A match you are removing already has scores. Clear its scores first';
  end if;
  delete from matches where auction_id = p_auction and match_no > v_count;

  select count(*) into v_have from matches where auction_id = p_auction;
  insert into matches (auction_id, match_no, title)
  select p_auction, n, 'Match ' || n from generate_series(v_have + 1, v_count) n
  on conflict do nothing;

  update auctions set format = p_format where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_players(p_auction uuid, p_players jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; n int;
begin
  a := require_owner(p_auction);
  if a.status <> 'setup' then raise exception 'The player list is locked once the auction has started'; end if;
  if jsonb_typeof(p_players) <> 'array' then raise exception 'Player list must be a list'; end if;
  delete from players where auction_id = p_auction;
  insert into players (auction_id, order_no, name, role, base_price, country, photo_url, stats)
  select p_auction, (x->>'order')::numeric, trim(x->>'name'), x->>'role', (x->>'base')::int,
         nullif(trim(x->>'country'),''), nullif(trim(x->>'photo'),''),
         case when jsonb_typeof(x->'stats') = 'array' then x->'stats' else '[]'::jsonb end
  from jsonb_array_elements(p_players) x;
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_scores(p_auction uuid, p_match uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; n int;
begin
  a := require_owner(p_auction);
  n := write_match_scores(p_auction, p_match, p_rows);
  update matches set edited_at = now() where id = p_match and scorecard_text is not null;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_scores(p_auction uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return set_scores(p_auction, (select id from matches where auction_id = p_auction order by match_no limit 1), p_rows);
end $function$
;

CREATE OR REPLACE FUNCTION public.skip_player(p_auction uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; p players;
begin
  a := require_owner(p_auction);
  if a.status not in ('running','paused') then raise exception 'The auction is not running'; end if;
  if a.phase = 'live' then
    select * into p from players where id = a.current_player_id;
    update players set status = 'skipped' where id = p.id;
    update auctions set phase = 'gap', current_bid = null, leader_team_id = null, bid_count = 0,
      phase_ends_at = case when a.status = 'running' then clock_timestamp() + interval '3 seconds' else phase_ends_at end,
      paused_remaining_ms = case when a.status = 'paused' then 3000 else paused_remaining_ms end
    where id = p_auction;
  else
    select * into p from players where auction_id = p_auction and status = 'pool' order by order_no, name limit 1;
    if not found then raise exception 'There is no player left to skip'; end if;
    update players set status = 'skipped' where id = p.id;
  end if;
  return p.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.start_auction(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; nt int; np int;
begin
  a := require_owner(p_auction);
  if a.status <> 'setup' then raise exception 'This auction has already started'; end if;
  select count(*) into nt from teams where auction_id = p_auction;
  select count(*) into np from players where auction_id = p_auction;
  if nt < 2 then raise exception 'At least 2 teams must join before you can start'; end if;
  if np < 1 then raise exception 'Upload the player sheet before starting'; end if;
  update teams set purse_left = a.purse where auction_id = p_auction;
  update auctions set status = 'running', round = 1, phase = 'gap',
    phase_ends_at = clock_timestamp() + interval '5 seconds',
    current_player_id = null, current_bid = null, leader_team_id = null, bid_count = 0
  where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.start_unsold_round(p_auction uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions;
begin
  a := require_owner(p_auction);
  if a.status <> 'completed' then raise exception 'Wait until every player has been auctioned'; end if;
  if not exists (select 1 from players where auction_id = p_auction and status = 'unsold') then
    raise exception 'There are no unsold players';
  end if;
  update players set status = 'pool' where auction_id = p_auction and status = 'unsold';
  if active_team_count(p_auction) = 0 then
    update players set status = 'unsold' where auction_id = p_auction and status = 'pool';
    raise exception 'Every team is full or out of money, so nobody can bid in an unsold round';
  end if;
  update auctions set status = 'running', round = round + 1, phase = 'gap',
    phase_ends_at = clock_timestamp() + interval '5 seconds' where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.team_colors()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array['#D99A06','#2F7DD1','#8A4FD8','#D2323F','#15845A','#E0663A','#0E9AA7','#6B7A99',
               '#C2489A','#8C6B1F','#4B5FD6','#5E9E2F','#B5485B','#2C8C7A','#A0632B','#7A4FA0',
               '#3D7EA6','#C27C0E','#6D8B3A','#9C3F7A'];
$function$
;

CREATE OR REPLACE FUNCTION public.unskip_player(p_player uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p players; a auctions;
begin
  select * into p from players where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  a := require_owner(p.auction_id);
  if p.status <> 'skipped' then return; end if;
  update players set status = case when a.status = 'completed' then 'unsold' else 'pool' end where id = p_player;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_auction_settings(p_auction uuid, p_settings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; v_inc jsonb; v_teams int; e jsonb;
begin
  a := require_owner(p_auction);
  if a.status <> 'setup' then raise exception 'Rules are locked once the auction has started'; end if;

  v_inc := coalesce(p_settings->'increments', a.increments);
  if jsonb_typeof(v_inc) <> 'array' or jsonb_array_length(v_inc) = 0 then raise exception 'Add at least one bid increment level'; end if;
  for e in select * from jsonb_array_elements(v_inc) loop
    if coalesce((e->>'step')::int,0) < 1 or coalesce((e->>'from')::int,-1) < 0 then
      raise exception 'Each increment level needs a starting price of 0 or more and a raise of at least 1 lakh';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('from',(x->>'from')::int,'step',(x->>'step')::int) order by (x->>'from')::int)
    into v_inc from jsonb_array_elements(v_inc) x;

  update auctions set
    name            = coalesce(nullif(trim(p_settings->>'name'),''), name),
    max_teams       = coalesce((p_settings->>'max_teams')::int, max_teams),
    purse           = coalesce((p_settings->>'purse')::int, purse),
    timer_seconds   = coalesce((p_settings->>'timer_seconds')::int, timer_seconds),
    min_squad       = coalesce((p_settings->>'min_squad')::int, min_squad),
    max_squad       = coalesce((p_settings->>'max_squad')::int, max_squad),
    min_bowlers     = coalesce((p_settings->>'min_bowlers')::int, min_bowlers),
    min_allrounders = coalesce((p_settings->>'min_allrounders')::int, min_allrounders),
    increments      = v_inc
  where id = p_auction returning * into a;

  if a.min_squad > a.max_squad then raise exception 'Minimum squad can''t be larger than maximum squad'; end if;
  if a.min_bowlers + a.min_allrounders > a.max_squad then raise exception 'Role minimums don''t fit in the maximum squad'; end if;
  select count(*) into v_teams from teams where auction_id = p_auction;
  if v_teams > a.max_teams then raise exception '% teams have already joined. Remove some teams before lowering the limit to %', v_teams, a.max_teams; end if;

  update teams set purse_left = a.purse where auction_id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_points_rules(p_auction uuid, p_rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a auctions; k text; v jsonb; clean jsonb := '{}';
begin
  a := require_owner(p_auction);
  if jsonb_typeof(p_rules) <> 'object' then raise exception 'Points rules must be a list of values'; end if;
  for k, v in select * from jsonb_each(p_rules) loop
    if jsonb_typeof(v) <> 'number' then raise exception 'Points for "%" must be a number', k; end if;
    if abs((v)::numeric) > 1000 then raise exception 'Points for "%" look too large', k; end if;
    clean := clean || jsonb_build_object(k, round((v)::numeric, 1));
  end loop;
  update auctions set points_rules = clean where id = p_auction;
end $function$
;

CREATE OR REPLACE FUNCTION public.write_match_scores(p_auction uuid, p_match uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; n int := 0;
begin
  if not exists (select 1 from matches where id = p_match and auction_id = p_auction) then
    raise exception 'That match is not part of this auction';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Scores must be a list'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from players where id = (r->>'player_id')::uuid and auction_id = p_auction) then
      raise exception 'A player in the list is not part of this auction';
    end if;
    if coalesce((r->>'clear')::boolean, false) then
      delete from player_scores where player_id = (r->>'player_id')::uuid and match_id = p_match;
    else
      insert into player_scores as s (player_id, match_id, auction_id, played, runs, fours, sixes, out, wickets, maidens, catches, stumpings, run_outs, updated_at)
      values ((r->>'player_id')::uuid, p_match, p_auction,
        coalesce((r->>'played')::boolean, true),
        greatest(0, coalesce((r->>'runs')::int, 0)), greatest(0, coalesce((r->>'fours')::int, 0)), greatest(0, coalesce((r->>'sixes')::int, 0)),
        coalesce((r->>'out')::boolean, false),
        least(10, greatest(0, coalesce((r->>'wickets')::int, 0))), greatest(0, coalesce((r->>'maidens')::int, 0)),
        greatest(0, coalesce((r->>'catches')::int, 0)), greatest(0, coalesce((r->>'stumpings')::int, 0)), greatest(0, coalesce((r->>'run_outs')::int, 0)),
        now())
      on conflict (player_id, match_id) do update set
        played = excluded.played, runs = excluded.runs, fours = excluded.fours, sixes = excluded.sixes,
        out = excluded.out, wickets = excluded.wickets, maidens = excluded.maidens, catches = excluded.catches,
        stumpings = excluded.stumpings, run_outs = excluded.run_outs, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$
;

-- ---------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------
create policy "members read auctions" on public.auctions as PERMISSIVE for SELECT to authenticated using (is_member(id));

create policy "members read bids" on public.bids as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

create policy "members read chat" on public.chat_messages as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

create policy "members read matches" on public.matches as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

create policy "members read scores" on public.player_scores as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

create policy "members read players" on public.players as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

create policy "members read teams" on public.teams as PERMISSIVE for SELECT to authenticated using (is_member(auction_id));

-- ---------------------------------------------------------------------
-- Triggers, realtime, permissions
-- ---------------------------------------------------------------------
CREATE TRIGGER auction_first_match AFTER INSERT ON public.auctions FOR EACH ROW EXECUTE FUNCTION auction_first_match();

CREATE TRIGGER chat_auction_change AFTER UPDATE OF status ON public.auctions FOR EACH ROW EXECUTE FUNCTION chat_on_auction_change();

CREATE TRIGGER chat_player_change AFTER UPDATE OF status ON public.players FOR EACH ROW EXECUTE FUNCTION chat_on_player_change();

alter publication supabase_realtime add table public.auctions;

alter publication supabase_realtime add table public.bids;

alter publication supabase_realtime add table public.chat_messages;

alter publication supabase_realtime add table public.matches;

alter publication supabase_realtime add table public.player_scores;

alter publication supabase_realtime add table public.players;

alter publication supabase_realtime add table public.teams;

revoke execute on function public.active_team_count(p_auction uuid) from public, anon;
revoke execute on function public.active_team_count(p_auction uuid) from authenticated;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

revoke execute on function public.advance_auction(p_auction uuid) from public, anon;
grant execute on function public.advance_auction(p_auction uuid) to authenticated;

revoke execute on function public.auction_first_match() from public, anon;
revoke execute on function public.auction_first_match() from authenticated;

revoke execute on function public.chat_on_auction_change() from public, anon;
revoke execute on function public.chat_on_auction_change() from authenticated;

revoke execute on function public.chat_on_player_change() from public, anon;
revoke execute on function public.chat_on_player_change() from authenticated;

revoke execute on function public.create_auction(p_name text, p_team_name text) from public, anon;
grant execute on function public.create_auction(p_name text, p_team_name text) to authenticated;

revoke execute on function public.delete_auction(p_auction uuid) from public, anon;
grant execute on function public.delete_auction(p_auction uuid) to authenticated;

revoke execute on function public.delete_message(p_id bigint) from public, anon;
grant execute on function public.delete_message(p_id bigint) to authenticated;

revoke execute on function public.end_auction(p_auction uuid) from public, anon;
grant execute on function public.end_auction(p_auction uuid) to authenticated;

revoke execute on function public.find_auction(p_code text) from public, anon;
grant execute on function public.find_auction(p_code text) to authenticated;

revoke execute on function public.finish_auction(p_auction uuid) from public, anon;
revoke execute on function public.finish_auction(p_auction uuid) from authenticated;

revoke execute on function public.fmt_lakh(p integer) from public, anon;
grant execute on function public.fmt_lakh(p integer) to authenticated;

revoke execute on function public.import_scorecard(p_auction uuid, p_match uuid, p_rows jsonb, p_text text, p_url text, p_aliases jsonb, p_done boolean) from public, anon;
grant execute on function public.import_scorecard(p_auction uuid, p_match uuid, p_rows jsonb, p_text text, p_url text, p_aliases jsonb, p_done boolean) to authenticated;

revoke execute on function public.increment_for(p_increments jsonb, p_amount integer) from public, anon;
grant execute on function public.increment_for(p_increments jsonb, p_amount integer) to authenticated;

revoke execute on function public.is_member(p_auction uuid) from public, anon;
grant execute on function public.is_member(p_auction uuid) to authenticated;

revoke execute on function public.join_auction(p_code text, p_team_name text) from public, anon;
grant execute on function public.join_auction(p_code text, p_team_name text) to authenticated;

revoke execute on function public.owner_join(p_auction uuid, p_team_name text) from public, anon;
grant execute on function public.owner_join(p_auction uuid, p_team_name text) to authenticated;

revoke execute on function public.pause_auction(p_auction uuid) from public, anon;
grant execute on function public.pause_auction(p_auction uuid) to authenticated;

revoke execute on function public.place_bid(p_auction uuid, p_expected integer) from public, anon;
grant execute on function public.place_bid(p_auction uuid, p_expected integer) to authenticated;

revoke execute on function public.post_message(p_auction uuid, p_body text) from public, anon;
grant execute on function public.post_message(p_auction uuid, p_body text) to authenticated;

revoke execute on function public.remove_team(p_team uuid) from public, anon;
grant execute on function public.remove_team(p_team uuid) to authenticated;

revoke execute on function public.require_owner(p_auction uuid) from public, anon;
revoke execute on function public.require_owner(p_auction uuid) from authenticated;

revoke execute on function public.reset_auction(p_auction uuid) from public, anon;
grant execute on function public.reset_auction(p_auction uuid) to authenticated;

revoke execute on function public.resume_auction(p_auction uuid) from public, anon;
grant execute on function public.resume_auction(p_auction uuid) to authenticated;

revoke execute on function public.save_match(p_match uuid, p_title text, p_starts_on date, p_done boolean) from public, anon;
grant execute on function public.save_match(p_match uuid, p_title text, p_starts_on date, p_done boolean) to authenticated;

revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;

revoke execute on function public.set_auction_call(p_auction uuid, p_meet_url text, p_starts_at timestamp with time zone) from public, anon;
grant execute on function public.set_auction_call(p_auction uuid, p_meet_url text, p_starts_at timestamp with time zone) to authenticated;

revoke execute on function public.set_auction_format(p_auction uuid, p_format text, p_matches integer) from public, anon;
grant execute on function public.set_auction_format(p_auction uuid, p_format text, p_matches integer) to authenticated;

revoke execute on function public.set_players(p_auction uuid, p_players jsonb) from public, anon;
grant execute on function public.set_players(p_auction uuid, p_players jsonb) to authenticated;

revoke execute on function public.set_scores(p_auction uuid, p_match uuid, p_rows jsonb) from public, anon;
grant execute on function public.set_scores(p_auction uuid, p_match uuid, p_rows jsonb) to authenticated;

revoke execute on function public.set_scores(p_auction uuid, p_rows jsonb) from public, anon;
grant execute on function public.set_scores(p_auction uuid, p_rows jsonb) to authenticated;

revoke execute on function public.skip_player(p_auction uuid) from public, anon;
grant execute on function public.skip_player(p_auction uuid) to authenticated;

revoke execute on function public.start_auction(p_auction uuid) from public, anon;
grant execute on function public.start_auction(p_auction uuid) to authenticated;

revoke execute on function public.start_unsold_round(p_auction uuid) from public, anon;
grant execute on function public.start_unsold_round(p_auction uuid) to authenticated;

revoke execute on function public.team_colors() from public, anon;
grant execute on function public.team_colors() to authenticated;

revoke execute on function public.unskip_player(p_player uuid) from public, anon;
grant execute on function public.unskip_player(p_player uuid) to authenticated;

revoke execute on function public.update_auction_settings(p_auction uuid, p_settings jsonb) from public, anon;
grant execute on function public.update_auction_settings(p_auction uuid, p_settings jsonb) to authenticated;

revoke execute on function public.update_points_rules(p_auction uuid, p_rules jsonb) from public, anon;
grant execute on function public.update_points_rules(p_auction uuid, p_rules jsonb) to authenticated;

revoke execute on function public.write_match_scores(p_auction uuid, p_match uuid, p_rows jsonb) from public, anon;
revoke execute on function public.write_match_scores(p_auction uuid, p_match uuid, p_rows jsonb) from authenticated;

grant SELECT on public.auctions to authenticated;

grant SELECT on public.bids to authenticated;

grant SELECT on public.chat_messages to authenticated;

grant SELECT on public.matches to authenticated;

grant SELECT on public.player_scores to authenticated;

grant SELECT on public.players to authenticated;

grant SELECT on public.teams to authenticated;

-- App owner (sees the admin overview). Change the email if needed.
insert into public.app_admins (user_id)
  select id from auth.users where email = 'bsivasagar2015@email.iimcal.ac.in'
on conflict do nothing;
