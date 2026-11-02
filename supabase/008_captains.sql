-- =====================================================================
-- Update 8: captain and vice-captain picks.
--   * The admin opens a pick window with a deadline: one from match 1 (start of
--     the series), and later another from the first match after a mid auction.
--   * Each team picks a captain (2x) and vice-captain (1.5x) from its squad and
--     can change them until the deadline. Picks stay hidden from other teams
--     until the deadline passes.
--   * A team that misses the deadline gets its most expensive player as captain
--     and the next most expensive as vice-captain, and the "missed deadline"
--     points set in the points rules.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.captain_windows (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  from_match_no int not null default 1 check (from_match_no >= 1),
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  unique (auction_id, from_match_no)
);

create table if not exists public.captain_picks (
  window_id uuid not null references public.captain_windows(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  captain_id uuid references public.players(id) on delete set null,
  vice_id uuid references public.players(id) on delete set null,
  auto boolean not null default false,
  picked_at timestamptz not null default now(),
  primary key (window_id, team_id),
  check (captain_id is distinct from vice_id or captain_id is null)
);

alter table public.captain_windows enable row level security;
alter table public.captain_picks enable row level security;

-- Your own team's picks always; everyone else's only after the deadline.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'captain_windows' and policyname = 'members read captain windows') then
    create policy "members read captain windows" on public.captain_windows
      for select to authenticated using (is_member(auction_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'captain_picks' and policyname = 'members read captain picks') then
    create policy "members read captain picks" on public.captain_picks
      for select to authenticated using (
        is_member(auction_id) and (
          exists (select 1 from teams t where t.id = team_id and t.user_id = auth.uid())
          or exists (select 1 from captain_windows w where w.id = window_id and w.deadline <= now())
        ));
  end if;
end $$;

revoke insert, update, delete on public.captain_windows, public.captain_picks from anon, authenticated;
grant select on public.captain_windows, public.captain_picks to authenticated;

-- Admin: open (or move) a pick window. p_from_match = 1 for the start of the series.
create or replace function public.set_captain_window(p_auction uuid, p_from_match int, p_deadline timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare a auctions; w captain_windows; v_title text;
begin
  a := require_owner(p_auction);
  if a.status = 'setup' then raise exception 'Run the auction first, so every team has a squad to pick from'; end if;
  if p_deadline is null then raise exception 'Choose a deadline'; end if;
  if coalesce(p_from_match, 0) < 1 then raise exception 'Choose the match the picks start from'; end if;
  if not exists (select 1 from matches where auction_id = p_auction and match_no = p_from_match) then
    raise exception 'That match is not part of this auction';
  end if;

  select * into w from captain_windows where auction_id = p_auction and from_match_no = p_from_match;
  if found then
    -- Moving the deadline later reopens picking: drop the automatic picks so teams can choose again.
    if p_deadline > now() then delete from captain_picks where window_id = w.id and auto; end if;
    update captain_windows set deadline = p_deadline where id = w.id returning * into w;
  else
    insert into captain_windows (auction_id, from_match_no, deadline) values (p_auction, p_from_match, p_deadline) returning * into w;
  end if;

  select title into v_title from matches where auction_id = p_auction and match_no = p_from_match;
  insert into chat_messages (auction_id, author, body, kind)
  values (p_auction, 'Auction', 'Pick your captain (2x) and vice-captain (1.5x)'
    || case when p_from_match > 1 then ' from ' || v_title else '' end
    || ' by ' || to_char(p_deadline at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' IST. Open "Captain picks" to choose.', 'system');
  return w.id;
end $$;

create or replace function public.delete_captain_window(p_window uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w captain_windows; a auctions;
begin
  select * into w from captain_windows where id = p_window;
  if not found then raise exception 'That pick window no longer exists'; end if;
  a := require_owner(w.auction_id);
  delete from captain_windows where id = p_window;
end $$;

-- A team picks (or changes) its captain and vice-captain before the deadline.
create or replace function public.pick_captains(p_window uuid, p_captain uuid, p_vice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w captain_windows; t teams; first_time boolean;
begin
  select * into w from captain_windows where id = p_window;
  if not found then raise exception 'That pick window no longer exists'; end if;
  select * into t from teams where auction_id = w.auction_id and user_id = auth.uid();
  if not found then raise exception 'Only teams in this auction can pick a captain'; end if;
  if now() >= w.deadline then raise exception 'The deadline has passed, so picks are locked'; end if;
  if p_captain is null or p_vice is null then raise exception 'Choose both a captain and a vice-captain'; end if;
  if p_captain = p_vice then raise exception 'The captain and vice-captain must be different players'; end if;
  if (select count(*) from players where id in (p_captain, p_vice) and auction_id = w.auction_id and sold_to = t.id) <> 2 then
    raise exception 'Both players must be in your squad';
  end if;

  first_time := not exists (select 1 from captain_picks where window_id = p_window and team_id = t.id);
  insert into captain_picks (window_id, team_id, auction_id, captain_id, vice_id, auto, picked_at)
  values (p_window, t.id, w.auction_id, p_captain, p_vice, false, now())
  on conflict (window_id, team_id) do update
    set captain_id = excluded.captain_id, vice_id = excluded.vice_id, auto = false, picked_at = now();

  if first_time then
    insert into chat_messages (auction_id, author, body, kind)
    values (w.auction_id, 'Auction', t.name || ' has locked in a captain and vice-captain. Picks are revealed at the deadline.', 'system');
  end if;
end $$;

-- After a deadline: give teams that didn't pick their two most expensive players. Anyone in the
-- auction can call this (the app does it when the deadline passes); it only acts once per team.
create or replace function public.finalize_captain_windows(p_auction uuid)
returns int language plpgsql security definer set search_path = public as $$
declare w captain_windows; t teams; c uuid; v uuid; n int := 0; names text; missed text;
begin
  if not is_member(p_auction) then raise exception 'You are not part of this auction'; end if;
  for w in select * from captain_windows where auction_id = p_auction and deadline <= now() order by from_match_no for update loop
    missed := null;
    for t in select * from teams where auction_id = p_auction order by joined_at loop
      continue when exists (select 1 from captain_picks where window_id = w.id and team_id = t.id);
      select id into c from players where auction_id = p_auction and sold_to = t.id order by sold_price desc nulls last, order_no, name limit 1;
      continue when c is null;
      select id into v from players where auction_id = p_auction and sold_to = t.id and id <> c order by sold_price desc nulls last, order_no, name limit 1;
      insert into captain_picks (window_id, team_id, auction_id, captain_id, vice_id, auto, picked_at)
      values (w.id, t.id, p_auction, c, v, true, now());
      missed := coalesce(missed || ', ', '') || t.name;
      n := n + 1;
    end loop;

    if missed is not null then
      insert into chat_messages (auction_id, author, body, kind)
      values (p_auction, 'Auction', 'Missed the captain deadline: ' || missed
        || '. Their most expensive player is captain and the next is vice-captain.', 'system');
    end if;
  end loop;
  return n;
end $$;

-- Who has picked in each window (without saying whom), so everyone can see who is still to pick.
create or replace function public.captain_status(p_auction uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_auction) then raise exception 'You are not part of this auction'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('window_id', window_id, 'team_id', team_id, 'auto', auto, 'picked_at', picked_at))
    from captain_picks where auction_id = p_auction), '[]'::jsonb);
end $$;

revoke execute on function public.set_captain_window(uuid, int, timestamptz), public.delete_captain_window(uuid),
  public.pick_captains(uuid, uuid, uuid), public.finalize_captain_windows(uuid), public.captain_status(uuid) from public, anon;
grant execute on function public.set_captain_window(uuid, int, timestamptz), public.delete_captain_window(uuid),
  public.pick_captains(uuid, uuid, uuid), public.finalize_captain_windows(uuid), public.captain_status(uuid) to authenticated;

-- Live updates in the app.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'captain_windows') then
    alter publication supabase_realtime add table public.captain_windows;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'captain_picks') then
    alter publication supabase_realtime add table public.captain_picks;
  end if;
end $$;
