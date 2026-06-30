import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Resolves the authenticated user for an API route, or returns a 401 response.
 * Every route handler should call this first — RLS is the second line of
 * defense, this is the first (fail fast with a clean error instead of letting
 * a null user_id reach a query).
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { supabase, user, response: null };
}

/** Basic shape guard for JSON bodies — throws a 400-able error if fields are missing/wrong type. */
export class ValidationError extends Error {}

export function requireFields(body: Record<string, any>, fields: string[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    throw new ValidationError(`Missing required field(s): ${missing.join(', ')}`);
  }
}

export function handleApiError(err: unknown) {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error('API error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/**
 * Writes an audit_logs row for a sensitive action (upload, delete, etc).
 * Best-effort: a logging failure must never block the underlying action, so
 * errors are swallowed (and reported to the server console) rather than
 * thrown.
 */
export async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { userId: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, any> }
) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
    } as any);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
