import type { CSSProperties } from 'react';
import type { Team } from '../lib/types';
import type { VideoCtl } from '../lib/useVideo';
import { MicIcon, VideoControls, VideoTile } from './InAppVideo';

const initials = (name: string) => {
  const w = name.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[1][0] : '')).toUpperCase();
};

/** Lobby video: everyone can say hello and check sound before bidding starts.
 *  The same call carries on into the auction room when the admin presses Start. */
export default function VideoLounge({ v, teams }: { v: VideoCtl; teams: Team[] }) {
  if (v.status === 'unavailable') return null;
  const teamUsers = new Set(teams.map(t => t.user_id));
  const others = v.peers.filter(p => !teamUsers.has(p.userId));

  return (
    <section className="panel card lounge">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Video lounge</h2>
          <span className="hint">
            {v.status === 'on'
              ? "You're on video. You'll stay connected when the auction starts."
              : 'Say hello and check your camera and sound before bidding starts.'}
          </span>
        </div>
        <VideoControls v={v} />
      </div>
      <div className="lounge-grid">
        {teams.map(t => {
          const p = v.byUser[t.user_id];
          const cam = p && p.camOn && p.video ? p.video : null;
          return (
            <div key={t.id} className={`lounge-tile${p ? ' here' : ''}`} style={{ '--seat': t.color } as CSSProperties}>
              {cam ? <VideoTile track={cam} mirror={p!.local} /> : <span className="face" aria-hidden="true">{initials(t.name)}</span>}
              <span className="lt-name">
                {p && !p.micOn && <MicIcon off />}
                {t.name}{p?.local ? ' (you)' : ''}
              </span>
              {!p && <span className="lt-away">Not on video yet</span>}
            </div>
          );
        })}
        {others.map(p => (
          <div key={p.sessionId} className="lounge-tile here" style={{ '--seat': 'var(--muted)' } as CSSProperties}>
            {p.camOn && p.video ? <VideoTile track={p.video} mirror={p.local} /> : <span className="face" aria-hidden="true">{initials(p.name || '?')}</span>}
            <span className="lt-name">{!p.micOn && <MicIcon off />}{p.local ? 'You' : p.name} · admin</span>
          </div>
        ))}
      </div>
    </section>
  );
}
