import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Anon client — safe for server actions that INSERT under anon RLS policy.
export function anonClient() {
  if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase public env vars');
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Service role client — server-only. Bypasses RLS. Never import from client code.
export function serviceClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service env vars');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
