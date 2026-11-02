-- =====================================================================
-- Update 7: paste-a-scorecard, remembered name spellings, app admin overview.
-- Safe to run more than once.
-- =====================================================================

-- Other spellings of a player's name seen on scorecards ("Arshdeep Singh" for "Arshdeep singh").
alter table public.players add column if not exists aliases text[] not null default '{}';

-- The original scorecard behind each match's points, kept for everyone to check.
alter table public.matches add column if not exists scorecard_text text;
alter table public.matches add column if not exists scorecard_url text;
alter table public.matches add column if not exists scored_by uuid;
alter table public.matches add column if not exists scored_by_name text;
alter table public.matches add column if not exists scored_at timestamptz;
alter table public.matches add column if not exists edited_at timestamptz;

-- Writes figures for one match (shared by manual entry and the scorecard import).
create or replace function public.write_match_scores(p_auction uuid, p_match uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
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
end $$;

-- Manual entry by the admin. If a scorecard was pasted for this match, note that figures were edited by hand.
create or replace function public.set_scores(p_auction uuid, p_match uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare a auctions; n int;
begin
  a := require_owner(p_auction);
  n := write_match_scores(p_auction, p_match, p_rows);
  update matches set edited_at = now() where id = p_match and scorecard_text is not null;
  return n;
end $$;

-- Admin: save a pasted scorecard. p_rows = figures for auction players (as for set_scores),
-- p_aliases = [{"player_id": "...", "alias": "Arshdeep Singh"}] confirmed name spellings to remember.
create or replace function public.import_scorecard(p_auction uuid, p_match uuid, p_rows jsonb, p_text text,
  p_url text, p_aliases jsonb, p_done boolean)
returns int language plpgsql security definer set search_path = public as $$
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
end $$;

-- ---------------------------------------------------------------------
-- App admin: who has signed up and which auctions exist.
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
insert into public.app_admins (user_id)
  select id from auth.users where email = 'bsivasagar2015@email.iimcal.ac.in'
on conflict do nothing;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
end $$;

revoke execute on function public.write_match_scores(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.set_scores(uuid, uuid, jsonb), public.import_scorecard(uuid, uuid, jsonb, text, text, jsonb, boolean),
  public.admin_overview() from public, anon;
grant execute on function public.set_scores(uuid, uuid, jsonb), public.import_scorecard(uuid, uuid, jsonb, text, text, jsonb, boolean),
  public.admin_overview() to authenticated;
