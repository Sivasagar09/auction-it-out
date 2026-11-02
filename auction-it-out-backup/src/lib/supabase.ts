import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

/** Turns a Supabase/Postgres error into the plain sentence raised by the database functions. */
export function errorText(e: unknown): string {
  if (!e) return 'Something went wrong. Try again.';
  const msg = typeof e === 'string' ? e : (e as { message?: string }).message || '';
  if (/failed to fetch|networkerror/i.test(msg)) return 'Could not reach the server. Check your internet connection.';
  return msg || 'Something went wrong. Try again.';
}
