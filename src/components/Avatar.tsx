import { useState } from 'react';
import type { Player } from '../lib/types';

/** Player photo, or their initials if there is no photo or it fails to load. */
export default function Avatar({ p, size }: { p: Pick<Player, 'name' | 'photo_url'>; size: number }) {
  const [broken, setBroken] = useState(false);
  const initials = p.name.replace(/\(.*?\)|[^A-Za-z\s]/g, '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (p.photo_url && !broken) {
    return <img className="avatar" src={p.photo_url} alt="" style={style} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <span className="avatar initials" style={style} aria-hidden="true">{initials || '?'}</span>;
}
