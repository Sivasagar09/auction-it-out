// Gives a signed-in auction member a pass into that auction's private video room (Daily).
// The Daily API key never leaves the server. Set it once with:
//   Supabase dashboard > Edge Functions > Secrets > DAILY_API_KEY
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const DAILY = 'https://api.daily.co/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('DAILY_API_KEY');
    if (!key) return json({ error: 'not_configured', message: 'In-app video is not set up yet (no Daily API key).' }, 503);

    const auth = req.headers.get('Authorization') ?? '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return json({ error: 'signed_out', message: 'Sign in again to join the video.' }, 401);

    const { auction } = await req.json().catch(() => ({}));
    if (typeof auction !== 'string' || !/^[0-9a-f-]{36}$/i.test(auction)) return json({ error: 'bad_request', message: 'Missing auction.' }, 400);

    const { data: member, error: mErr } = await sb.rpc('is_member', { p_auction: auction });
    if (mErr) throw mErr;
    if (!member) return json({ error: 'not_member', message: 'Only people in this auction can join its video.' }, 403);

    const { data: a } = await sb.from('auctions').select('owner_id, max_teams').eq('id', auction).maybeSingle();
    const { data: team } = await sb.from('teams').select('name').eq('auction_id', auction).eq('user_id', user.id).maybeSingle();
    const name = team?.name || (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'Guest';

    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const room = `auction-${auction}`;

    // One private room per auction, created the first time anyone joins.
    let r = await fetch(`${DAILY}/rooms/${room}`, { headers });
    if (r.status === 404) {
      r = await fetch(`${DAILY}/rooms`, {
        method: 'POST', headers,
        body: JSON.stringify({
          name: room,
          privacy: 'private',
          properties: {
            // Room size cap keeps cost predictable: teams + admin + a couple of spares.
            max_participants: Math.min(Math.max((a?.max_teams ?? 8) + 3, 6), 25),
            enable_prejoin_ui: false,
            enable_chat: false,
          },
        }),
      });
    }
    if (!r.ok) return json({ error: 'daily_error', message: `Video service error (${r.status}).` }, 502);
    const roomInfo = await r.json();

    // A pass for this person only, valid for 6 hours.
    const t = await fetch(`${DAILY}/meeting-tokens`, {
      method: 'POST', headers,
      body: JSON.stringify({
        properties: {
          room_name: room,
          user_id: user.id,
          user_name: name.slice(0, 60),
          is_owner: a?.owner_id === user.id,
          exp: Math.floor(Date.now() / 1000) + 6 * 3600,
        },
      }),
    });
    if (!t.ok) return json({ error: 'daily_error', message: `Video service error (${t.status}).` }, 502);
    const { token } = await t.json();

    return json({ url: roomInfo.url, token });
  } catch (e) {
    return json({ error: 'server', message: (e as Error).message || 'Something went wrong.' }, 500);
  }
});
