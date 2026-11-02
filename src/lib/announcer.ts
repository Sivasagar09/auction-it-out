import { useEffect, useRef, useState } from 'react';
import { ROLE } from './rules';
import type { Auction, Player, Team } from './types';

export interface AnnouncerSettings { on: boolean; countdown: 0 | 3 | 5 | 10; bids: boolean }
const KEY = 'announcer';
const DEFAULTS: AnnouncerSettings = { on: false, countdown: 5, bids: false };

export function useAnnouncerSettings() {
  const [s, setS] = useState<AnnouncerSettings>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}'), on: false }; } catch { return DEFAULTS; }
  });
  const update = (patch: Partial<AnnouncerSettings>) => setS(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  return [s, update] as const;
}

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Amounts are in lakh: 460 -> "4.6 crore", 50 -> "50 lakh". */
function sayAmount(lakh: number) {
  return lakh >= 100 ? `${+(lakh / 100).toFixed(2)} crore` : `${lakh} lakh`;
}
function cleanName(name: string) {
  return name.replace(/\(.*?\)|[†*]/g, '').replace(/\s+/g, ' ').trim();
}

let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  const vs = window.speechSynthesis.getVoices();
  voice = vs.find(v => v.lang === 'en-IN') || vs.find(v => v.lang.startsWith('en-GB')) || vs.find(v => v.lang.startsWith('en')) || null;
}
if (speechSupported) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }

type Kind = 'intro' | 'bid' | 'count' | 'result' | 'info';
let speaking: Kind | null = null;

/** Speak a line. Bids and countdown numbers cut off older bids/numbers so the voice keeps up. */
export function say(text: string, kind: Kind = 'info') {
  if (!speechSupported) return;
  const synth = window.speechSynthesis;
  if ((kind === 'count' || kind === 'bid') && (speaking === 'bid' || speaking === 'count')) synth.cancel();
  if (kind === 'result' || kind === 'intro') { if (speaking === 'bid' || speaking === 'count') synth.cancel(); }
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-IN';
  u.rate = kind === 'count' ? 1.15 : 1.02;
  u.onstart = () => { speaking = kind; };
  u.onend = () => { if (speaking === kind) speaking = null; };
  synth.speak(u);
}

/**
 * Watches the auction and reads out: each new player, (optionally) every bid,
 * the last seconds of the countdown, and the result.
 */
export function useAnnouncer(a: Auction | null, players: Player[], teams: Team[], now: number, s: AnnouncerSettings) {
  const prev = useRef<{ key: string; bidCount: number; phase: string; status: string; lastSec: number }>({ key: '', bidCount: 0, phase: '', status: '', lastSec: 0 });

  useEffect(() => {
    if (!a) return;
    const p = prev.current;
    const player = players.find(x => x.id === a.current_player_id);
    const leader = teams.find(t => t.id === a.leader_team_id);
    const key = `${a.current_player_id}|${a.round}`;
    const enabled = s.on && speechSupported;

    // New player on the block
    if (a.phase === 'live' && key !== p.key && player) {
      if (enabled) {
        const bits = [`Next up, ${cleanName(player.name)}`, ROLE[player.role]];
        if (player.country) bits.push(player.country);
        say(`${bits.join(', ')}. Base price ${sayAmount(player.base_price)}.`, 'intro');
      }
      p.key = key; p.bidCount = a.bid_count; p.lastSec = 0;
    }
    // A new bid
    if (a.phase === 'live' && a.bid_count > p.bidCount && leader && a.current_bid != null) {
      if (enabled && s.bids) say(`${sayAmount(a.current_bid)}, ${leader.name}`, 'bid');
      p.bidCount = a.bid_count; p.lastSec = 0;
    }
    // Result
    if (a.phase === 'result' && p.phase === 'live' && player) {
      if (enabled) say(leader && a.current_bid != null
        ? `Sold! ${cleanName(player.name)} to ${leader.name} for ${sayAmount(a.current_bid)}.`
        : `${cleanName(player.name)} goes unsold.`, 'result');
    }
    // Pause, resume, close
    if (a.status !== p.status && p.status) {
      if (enabled && a.status === 'paused') say('The auction is paused.');
      if (enabled && a.status === 'running' && p.status === 'paused') say('The auction is back on.');
      if (enabled && a.status === 'completed') say('That is the end of the auction.');
    }
    p.phase = a.phase; p.status = a.status;
  }, [a, players, teams, s.on, s.bids]);

  // Countdown: the last N seconds of bidding
  useEffect(() => {
    if (!a || !s.on || !s.countdown || !speechSupported) return;
    if (a.status !== 'running' || a.phase !== 'live' || !a.phase_ends_at) return;
    const left = Math.ceil((new Date(a.phase_ends_at).getTime() - now) / 1000);
    const p = prev.current;
    if (left >= 1 && left <= s.countdown && left !== p.lastSec) {
      p.lastSec = left;
      say(String(left), 'count');
    }
  }, [a, now, s.on, s.countdown]);
}
