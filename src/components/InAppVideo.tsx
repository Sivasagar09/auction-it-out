import { useEffect, useRef } from 'react';
import type { VideoCtl, VideoPeer } from '../lib/useVideo';

/** Plays one camera track. Your own picture is mirrored, like a mirror. */
export function VideoTile({ track, mirror }: { track: MediaStreamTrack; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => { /* autoplay waits for a tap on some phones */ });
  }, [track]);
  return <video ref={ref} className={`cam${mirror ? ' mirror' : ''}`} autoPlay playsInline muted />;
}

function PeerAudio({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => { /* resumes after the next tap */ });
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

/** Everyone's voices. Rendered once per auction page so audio carries on in other tabs. */
export function CallAudio({ peers }: { peers: VideoPeer[] }) {
  return <div hidden>{peers.filter(p => !p.local && p.audio).map(p => <PeerAudio key={p.sessionId + p.audio!.id} track={p.audio!} />)}</div>;
}

const MicIcon = ({ off }: { off?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />{off && <path d="M3 3l18 18" />}
  </svg>
);
const CamIcon = ({ off }: { off?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" />{off && <path d="M3 3l18 18" />}
  </svg>
);
export { MicIcon };

/** Join / leave and mic / camera buttons, shown in the auction's tab bar. */
export function VideoControls({ v }: { v: VideoCtl }) {
  if (v.status === 'unavailable') return null;
  return (
    <div className="vc-bar">
      {v.status !== 'on' ? (
        <button className="btn small call-join" onClick={v.join} disabled={v.status === 'joining'}>
          <CamIcon /> {v.status === 'joining' ? 'Joining…' : 'Join video in seats'}
        </button>
      ) : (
        <>
          <button className={`btn small${v.micOn ? '' : ' vc-off'}`} aria-pressed={!v.micOn} onClick={v.toggleMic}><MicIcon off={!v.micOn} /> {v.micOn ? 'Mute' : 'Unmute'}</button>
          <button className={`btn small${v.camOn ? '' : ' vc-off'}`} aria-pressed={!v.camOn} onClick={v.toggleCam}><CamIcon off={!v.camOn} /> {v.camOn ? 'Camera off' : 'Camera on'}</button>
          <button className="btn small" onClick={v.leave}>Leave video</button>
          <span className="vc-count">{v.peers.length} on video</span>
        </>
      )}
      {v.error && <span className="msg bad vc-err">{v.error}</span>}
    </div>
  );
}
