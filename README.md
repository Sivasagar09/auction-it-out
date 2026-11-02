# Auction It Out

IPL-style live player auction for friends: sign in, join an auction with a code, bid live against a timer,
build a squad within your purse, then earn fantasy points from real scorecards, match by match or across a whole series.

Live: https://auction-it-out.vercel.app

## What's in here

| Folder | What it is |
| --- | --- |
| `src/pages` | Login, Home (your auctions, create/join, app overview for the owner), Auction page |
| `src/components` | Lobby (setup, players, Excel import), Room (live bidding), Points (leaderboard, score entry, WhatsApp share), Series, ScorecardImport (paste a Cricinfo scorecard), VideoCall (Google Meet link), Chat, AdminPanel |
| `src/lib` | Supabase client, live auction hook, points rules, scorecard reader, voice announcer, Excel template |
| `supabase/schema.sql` | The whole database (tables, rules, functions, policies) as it is live today |
| `supabase/007_scorecard_admin.sql` | Update 7 on its own, for reference |
| `supabase/008_captains.sql` | Update 8: captain and vice-captain picks |

## Run it on your computer

```bash
npm install
cp .env.example .env   # then put in your Supabase URL and anon key
npm run dev
```

## Rebuild from scratch (if ever needed)

1. Create a new Supabase project. In the SQL Editor, run `supabase/schema.sql` once, then `supabase/008_captains.sql`.
2. In Supabase > Authentication, turn on email sign-in.
3. On Vercel, import this repo (framework: Vite) and add two environment variables:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. The database starts empty, so auctions and scores are not part of this backup.

## How it's built

- React 18 + Vite + TypeScript, hosted on Vercel.
- Supabase for sign-in, the Postgres database and realtime updates.
- People can only read the auctions they belong to. Every change (bids, sales, scores) goes through database
  functions that check who is asking, so nobody can edit data directly from the browser.

## Points rules (default)

Playing 4 · run 1 · four +1 · six +2 · 50 → +4 · 100 → +8 · duck −3 (not bowlers) ·
wicket 25 · 4 wickets +4 · 5 wickets +8 · maiden 4 · catch 8 · stumping 12 · run out 10 ·
captain 2× · vice-captain 1.5× · missed pick deadline: penalty set by the group (default 0).
