import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Auction, Bid, ChatMessage, Match, Player, PlayerScore, Team } from './types';

export interface AuctionState {
  auction: Auction | null;
  teams: Team[];
  players: Player[];
  bids: Bid[];
  scores: PlayerScore[];
  /** Matches in this auction, in order (one for a single-match auction). */
  matches: Match[];
  chat: ChatMessage[];
  loading: boolean;
  error: string | null;
  deleted: boolean;
  /** Current time on the server clock, in ms. Updates 5 times a second. */
  now: number;
  reload: () => Promise<void>;
}

/**
 * Loads one auction and keeps it live:
 *  - subscribes to database changes for this auction,
 *  - re-syncs every 10 s in case a live update was missed,
 *  - keeps a clock in step with the server so everyone's countdown matches,
 *  - nudges the server to move on when a countdown reaches zero.
 */
export function useAuction(id: string): AuctionState {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const auctionRef = useRef<Auction | null>(null);
  auctionRef.current = auction;

  const loadAuction = useCallback(async () => {
    const { data, error } = await supabase.from('auctions').select('*').eq('id', id).maybeSingle();
    if (error) { setError(error.message); return; }
    if (!data) { setDeleted(true); return; }
    setAuction(data as Auction);
  }, [id]);

  const loadRest = useCallback(async () => {
    const [t, p, b, s, m] = await Promise.all([
      supabase.from('teams').select('*').eq('auction_id', id).order('joined_at'),
      supabase.from('players').select('*').eq('auction_id', id).order('order_no').order('name'),
      supabase.from('bids').select('*').eq('auction_id', id).order('id', { ascending: false }).limit(80),
      supabase.from('player_scores').select('*').eq('auction_id', id),
      supabase.from('matches').select('*').eq('auction_id', id).order('match_no'),
    ]);
    if (t.data) setTeams(t.data as Team[]);
    if (p.data) setPlayers(p.data as Player[]);
    if (b.data) setBids(b.data as Bid[]);
    if (s.data) setScores(s.data as PlayerScore[]);
    if (m.data) setMatches(m.data as Match[]); // stays empty if the series update isn't in the database yet
    const err = t.error || p.error || b.error;
    if (err) setError(err.message);
  }, [id]);

  const loadChat = useCallback(async () => {
    const { data } = await supabase.from('chat_messages').select('*').eq('auction_id', id).order('id', { ascending: false }).limit(150);
    if (data) setChat((data as ChatMessage[]).reverse());
  }, [id]);

  const reload = useCallback(async () => {
    await Promise.all([loadAuction(), loadRest(), loadChat()]);
    setLoading(false);
  }, [loadAuction, loadRest, loadChat]);

  // Initial load, live updates, periodic re-sync
  useEffect(() => {
    let restTimer: ReturnType<typeof setTimeout> | undefined;
    const soonRest = () => { clearTimeout(restTimer); restTimer = setTimeout(loadRest, 150); };
    reload();

    const channel = supabase
      .channel(`auction-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${id}` }, payload => {
        if (payload.eventType === 'DELETE') setDeleted(true);
        else setAuction(payload.new as Auction);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_id=eq.${id}` }, soonRest)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `auction_id=eq.${id}` }, soonRest)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` }, payload => {
        const b = payload.new as Bid;
        setBids(prev => (prev.some(x => x.id === b.id) ? prev : [b, ...prev].slice(0, 80)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` }, soonRest)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_scores', filter: `auction_id=eq.${id}` }, soonRest)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `auction_id=eq.${id}` }, soonRest)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `auction_id=eq.${id}` }, payload => {
        const m = payload.new as ChatMessage;
        setChat(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m].slice(-200)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `auction_id=eq.${id}` }, payload => {
        const old = payload.old as Partial<ChatMessage>;
        setChat(prev => prev.filter(x => x.id !== old.id));
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') reload(); });

    const resync = setInterval(reload, 6000);
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(restTimer);
      clearInterval(resync);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [id, reload, loadRest]);

  // Safety net if live updates drop: while the auction is running, re-read the
  // auction row every 1.5 s, and refresh bids, teams and players whenever it
  // shows that something happened.
  const running = auction?.status === 'running' || auction?.status === 'paused';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadAuction, 1500);
    return () => clearInterval(t);
  }, [running, loadAuction]);
  const changeKey = auction ? `${auction.status}|${auction.phase}|${auction.current_player_id}|${auction.bid_count}` : '';
  useEffect(() => { if (changeKey) { loadRest(); loadChat(); } }, [changeKey, loadRest, loadChat]);

  // Server clock
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { data } = await supabase.rpc('server_now');
        const t1 = Date.now();
        if (data) samples.push(new Date(data as string).getTime() - (t0 + t1) / 2);
      }
      if (!cancelled && samples.length) offset.current = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    })();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => { cancelled = true; clearInterval(tick); };
  }, []);

  // When a countdown hits zero, ask the server to move on. Every open browser
  // does this; the server makes sure it only happens once.
  const lastNudge = useRef(0);
  useEffect(() => {
    const a = auctionRef.current;
    if (!a || a.status !== 'running' || !a.phase_ends_at) return;
    const ends = new Date(a.phase_ends_at).getTime();
    if (now < ends + 150) return;
    if (Date.now() - lastNudge.current < 1200) return;
    lastNudge.current = Date.now();
    supabase.rpc('advance_auction', { p_auction: a.id }).then(({ error }) => {
      if (!error) loadAuction();
    });
  }, [now, loadAuction]);

  return { auction, teams, players, bids, scores, matches, chat, loading, error, deleted, now, reload };
}
