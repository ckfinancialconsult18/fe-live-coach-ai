import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { retrieveRelevantChunks } from '@/lib/rag/retrieve';
import { openai } from '@/lib/openai';

const OBJECTION_QUERIES: Record<string, string> = {
  already_insured:  'already have insurance existing coverage objection response',
  think_about_it:   'think about it need time objection response',
  too_expensive:    'too expensive can\'t afford price objection response',
  call_later:       'call me back later not a good time objection response',
  need_spouse:      'need to talk to spouse husband wife objection response',
  busy:             'too busy not a good time objection response',
  not_interested:   'not interested objection response final expense',
};

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await req.json() as { objectionKey: string; transcript?: string };
  const { objectionKey, transcript } = body;

  const query = OBJECTION_QUERIES[objectionKey];
  if (!query) return NextResponse.json({ script: null });

  // Pull up to 4 chunks relevant to this objection from the user's knowledge base
  const chunks = await retrieveRelevantChunks(supabase, user.id, query, {
    matchCount: 4,
    minSimilarity: 0.3,
  }).catch(() => []);

  if (chunks.length === 0) return NextResponse.json({ script: null });

  const context = chunks.map((c) => c.content).join('\n\n---\n\n');

  const recentTranscript = transcript
    ? transcript.split('\n').slice(-6).join('\n')
    : '';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a Final Expense sales coach. The agent\'s prospect just raised an objection. ' +
          'Using ONLY the uploaded script/knowledge base content below, extract the most relevant 1–3 lines ' +
          'the agent should say right now to handle this objection. ' +
          'Return just the script lines, quoted naturally. No preamble, no bullet labels. ' +
          'If the knowledge base has no relevant language for this objection, return exactly: NO_MATCH',
      },
      {
        role: 'user',
        content: `OBJECTION TYPE: ${objectionKey.replace(/_/g, ' ')}\n\nRECENT TRANSCRIPT:\n${recentTranscript}\n\nKNOWLEDGE BASE:\n${context}`,
      },
    ],
  });

  const script = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!script || script === 'NO_MATCH') return NextResponse.json({ script: null });

  return NextResponse.json({ script });
}
