// Deprecated: use `lib/supabase/client.ts` (browser) or `lib/supabase/server.ts`
// (server) directly. Kept as a thin re-export so any existing import of
// `@/lib/supabase` keeps working.
import { createClient } from '@/lib/supabase/client';

export const supabase = createClient();
