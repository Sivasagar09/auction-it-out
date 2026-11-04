import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // True after someone arrives from a password-reset email, until they save a new password.
  const [recovering, setRecovering] = useState(() => /type=recovery/.test(window.location.hash));
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); setReady(true); if (e === 'PASSWORD_RECOVERY') setRecovering(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, recovering, doneRecovering: () => setRecovering(false) };
}

export function displayName(session: Session | null) {
  const u = session?.user;
  return (u?.user_metadata?.full_name as string | undefined) || u?.email?.split('@')[0] || 'there';
}
