import { useCallback, useEffect, useRef, useState } from 'react';
import DailyIframe, { type DailyCall, type DailyParticipant } from '@daily-co/daily-js';
import { supabase } from './supabase';

export interface VideoPeer {
  sessionId: string;
  /** Supabase user id, set on the server-issued pass, so a seat can find its person. */
  userId: string;
  name: string;
  local: boolean;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  camOn: boolean;
  micOn: boolean;
}

export type VideoStatus = 'off' | 'joining' | 'on' | 'unavailable';

export interface VideoCtl {
  status: VideoStatus;
  error: string;
  peers: VideoPeer[];
  byUser: Record<string, VideoPeer>;
  micOn: boolean;
  camOn: boolean;
  join: () => void;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

const playable = (t: DailyParticipant['tracks']['video']) => (t?.state === 'playable' ? t.persistentTrack ?? null : null);

function toPeer(p: DailyParticipant): VideoPeer {
  return {
    sessionId: p.session_id,
    userId: p.user_id,
    name: p.user_name,
    local: p.local,
    video: playable(p.tracks.video),
    audio: p.local ? null : playable(p.tracks.audio),
    camOn: p.tracks.video?.state !== 'off' && p.tracks.video?.state !== 'blocked',
    micOn: p.tracks.audio?.state !== 'off' && p.tracks.audio?.state !== 'blocked',
  };
}

/** In-app video (Daily) for one auction. The call survives switching tabs inside the auction. */
export function useVideo(auctionId: string): VideoCtl {
  const call = useRef<DailyCall | null>(null);
  const [status, setStatus] = useState<VideoStatus>('off');
  const [error, setError] = useState('');
  const [peers, setPeers] = useState<VideoPeer[]>([]);

  const refresh = useCallback(() => {
    const c = call.current;
    if (!c) { setPeers([]); return; }
    setPeers(Object.values(c.participants()).map(toPeer));
  }, []);

  const teardown = useCallback(async () => {
    const c = call.current;
    call.current = null;
    setPeers([]);
    if (c) { try { await c.leave(); } catch { /* already gone */ } c.destroy(); }
  }, []);

  const join = useCallback(async () => {
    if (call.current || status === 'joining') return;
    setStatus('joining'); setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('video-room', { body: { auction: auctionId } });
    if (fnErr || !data?.url) {
      let body: { error?: string; message?: string } = {};
      try { body = await (fnErr as { context?: Response })?.context?.json(); } catch { /* not JSON */ }
      if (body.error === 'not_configured') { setStatus('unavailable'); setError(body.message || 'In-app video is not set up yet.'); return; }
      setStatus('off'); setError(body.message || 'Could not start the video. Try again.');
      return;
    }
    const c = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
    call.current = c;
    const events = ['joined-meeting', 'participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped'] as const;
    events.forEach(e => c.on(e, refresh));
    c.on('left-meeting', () => { setStatus('off'); setPeers([]); });
    c.on('camera-error', () => setError('Your camera or microphone is blocked. Allow them for this site in the browser settings, then leave and join again.'));
    c.on('error', ev => { setError(ev?.errorMsg || 'The video call dropped.'); setStatus('off'); teardown(); });
    try {
      await c.join({ url: data.url, token: data.token, startVideoOff: false, startAudioOff: false });
      setStatus('on');
      refresh();
    } catch (e) {
      setError((e as Error)?.message || 'Could not join the video.');
      setStatus('off');
      teardown();
    }
  }, [auctionId, refresh, status, teardown]);

  const leave = useCallback(() => { teardown().then(() => setStatus('off')); }, [teardown]);

  // Leave the call when leaving the auction page or closing the tab.
  useEffect(() => {
    const bye = () => { call.current?.leave(); };
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); teardown(); };
  }, [teardown]);

  const me = peers.find(p => p.local);
  const micOn = !!me?.micOn;
  const camOn = !!me?.camOn;
  const toggleMic = useCallback(() => { call.current?.setLocalAudio(!micOn); }, [micOn]);
  const toggleCam = useCallback(() => { call.current?.setLocalVideo(!camOn); }, [camOn]);

  const byUser: Record<string, VideoPeer> = {};
  for (const p of peers) if (p.userId) byUser[p.userId] = p;

  return { status, error, peers, byUser, micOn, camOn, join, leave, toggleMic, toggleCam };
}
