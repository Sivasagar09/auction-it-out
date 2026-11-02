import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './scorecard.css';

interface AdminUser { id: string; email: string; name: string; created_at: string; last_sign_in_at: string | null; created: number; joined: number }
interface AdminAuction {
  id: string; name: string; format: string; status: string; created_at: string; join_code: string;
  owner_email: string | null; owner_name: string; teams: number; players: number; matches: number;
}
const STATUS: Record<string, string> = { setup: 'In setup', running: 'Live', paused: 'Paused', completed: 'Finished' };
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–');

/** App owner only: everyone who signed up and every auction. Hidden for everyone else. */
export default function AdminPanel({ myId }: { myId: string }) {
  const [data, setData] = useState<{ users: AdminUser[]; auctions: AdminAuction[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'users' | 'auctions'>('users');

  useEffect(() => {
    supabase.rpc('admin_overview').then(({ data, error }) => { if (!error && data) setData(data as { users: AdminUser[]; auctions: AdminAuction[] }); });
  }, []);
  if (!data) return null;

  const active7 = data.users.filter(u => u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at).getTime() < 7 * 864e5).length;
  const byOthers = data.auctions.filter(a => a.owner_email && !data.users.find(u => u.id === myId && u.email === a.owner_email));

  return (
    <section className="panel card admin-panel">
      <div className="row-between">
        <h2>App overview <span className="tag">Only you see this</span></h2>
        <button className="btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Show details'}</button>
      </div>
      <div className="summary admin-stats">
        <div><div className="label">People signed up</div><div className="v num">{data.users.length}</div></div>
        <div><div className="label">Signed in, last 7 days</div><div className="v num">{active7}</div></div>
        <div><div className="label">Auctions</div><div className="v num">{data.auctions.length}</div></div>
        <div><div className="label">Created by others</div><div className="v num">{byOthers.length}</div></div>
      </div>
      {open && (
        <>
          <div className="match-pills" role="tablist">
            <button role="tab" className="mpill" aria-selected={tab === 'users'} onClick={() => setTab('users')}>People ({data.users.length})</button>
            <button role="tab" className="mpill" aria-selected={tab === 'auctions'} onClick={() => setTab('auctions')}>Auctions ({data.auctions.length})</button>
          </div>
          <div className="tablewrap">
            {tab === 'users' ? (
              <table className="score-table admin-table">
                <thead><tr><th>Name</th><th>Email</th><th>Signed up</th><th>Last sign-in</th><th className="r">Created</th><th className="r">Joined</th></tr></thead>
                <tbody>
                  {data.users.map(u => (
                    <tr key={u.id}><td><b>{u.name || '–'}</b>{u.id === myId && <span className="tag">You</span>}</td><td>{u.email}</td>
                      <td>{when(u.created_at)}</td><td>{when(u.last_sign_in_at)}</td><td className="r num">{u.created}</td><td className="r num">{u.joined}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="score-table admin-table">
                <thead><tr><th>Auction</th><th>Created by</th><th>Created</th><th>Status</th><th className="r">Teams</th><th className="r">Players</th><th className="r">Matches</th></tr></thead>
                <tbody>
                  {data.auctions.map(a => (
                    <tr key={a.id}><td><b>{a.name}</b><span className="empty block">Code {a.join_code}{a.format === 'series' ? ' · Series' : ''}</span></td>
                      <td>{a.owner_name || '–'}<span className="empty block">{a.owner_email}</span></td>
                      <td>{when(a.created_at)}</td><td>{STATUS[a.status] ?? a.status}</td>
                      <td className="r num">{a.teams}</td><td className="r num">{a.players}</td><td className="r num">{a.matches}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <span className="hint">"Last sign-in" changes only when someone types their password; people who stay signed in keep their old date.</span>
        </>
      )}
    </section>
  );
}
