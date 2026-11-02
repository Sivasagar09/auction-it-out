import type { Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { displayName } from '../lib/useSession';

export default function Header({ session, children }: { session: Session | null; children?: ReactNode }) {
  return (
    <header className="top">
      <Link to="/" className="brand" aria-label="Auction It Out home">
        <h1>Auction <span>It</span> Out</h1>
      </Link>
      <div className="top-actions">
        {children}
        {session && (
          <>
            <span className="who">{displayName(session)}</span>
            <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </>
        )}
      </div>
    </header>
  );
}
