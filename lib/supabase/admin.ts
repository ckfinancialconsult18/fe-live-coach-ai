import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Service-role client — bypasses RLS entirely. Only for trusted server
 * contexts with no user session (cron jobs, background workers). Never
 * import this into anything reachable from a request that carries
 * user-supplied filters without an explicit, hand-written ownership check.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, which is not set in this environment
 * as of this writing — callers must handle the thrown error (the cron route
 * does, returning 500 with a clear message rather than crashing silently).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it in your deployment environment variables (Supabase Dashboard → Settings → API → service_role key) — never commit it or expose it client-side.'
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
