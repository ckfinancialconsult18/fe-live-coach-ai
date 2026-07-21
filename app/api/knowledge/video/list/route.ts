import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any; // video_knowledge not in generated types yet

  const { data, error } = await db
    .from('video_knowledge')
    .select('id, source_type, youtube_url, youtube_id, title, thumbnail_url, channel_name, duration_sec, category, tags, status, progress, error_message, ai_summary, key_takeaways, created_at, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  return NextResponse.json({ videos: data ?? [] });
}
