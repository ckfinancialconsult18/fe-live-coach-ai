import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// roleplay_sessions is not in the typed schema yet — use 'as any' to bypass
// until a migration adds the table. Graceful fallback to localStorage on client.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('roleplay_sessions')
      .select('*')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ sessions: data ?? [] });
  } catch {
    return NextResponse.json({ sessions: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      personaId: string;
      personaLabel: string;
      turnCount: number;
      overallScore: number;
      categoryScores: Record<string, number>;
      grade: string;
      durationSeconds: number;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('roleplay_sessions')
      .insert({
        agent_id: user.id,
        persona_id: body.personaId,
        persona_label: body.personaLabel,
        turn_count: body.turnCount,
        overall_score: body.overallScore,
        category_scores: body.categoryScores,
        grade: body.grade,
        duration_seconds: body.durationSeconds,
      });

    return NextResponse.json({ ok: true });
  } catch {
    // Table may not exist yet — client falls back to localStorage
    return NextResponse.json({ ok: true, stored: false });
  }
}
