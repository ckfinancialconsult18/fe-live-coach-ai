import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type EventType =
  | 'upload_failure'
  | 'extraction_failure'
  | 'embedding_failure'
  | 'queue_failure'
  | 'processing_complete'
  | 'search_latency';

/**
 * Best-effort structured logging to pipeline_logs. Never throws — a logging
 * failure must not take down the operation it's observing.
 */
export async function logPipelineEvent(
  supabase: SupabaseClient<Database>,
  params: {
    userId: string | null;
    eventType: EventType;
    targetType?: string;
    targetId?: string;
    durationMs?: number;
    message?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('pipeline_logs').insert({
      user_id: params.userId,
      event_type: params.eventType,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      duration_ms: params.durationMs ?? null,
      message: params.message ?? null,
      metadata: params.metadata ?? {},
    } as never);
  } catch (err) {
    console.error('Failed to write pipeline log:', err);
  }
}
