import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getPersona } from '@/lib/roleplay-personas';
import { requireUser } from '@/lib/api/guard';
import { checkRateLimit, roleplayLimiter } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { user, response } = await requireUser();
  if (!user) return response;

  const rl = checkRateLimit(roleplayLimiter, user.id);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please wait before continuing.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Window': '60',
        },
      },
    );
  }

  const { personaId, messages, turnCount = 0, rapportTrend = 'neutral' } = await req.json() as {
    personaId: string;
    messages: { role: 'agent' | 'prospect'; text: string }[];
    turnCount?: number;
    rapportTrend?: 'improving' | 'declining' | 'neutral';
  };

  const persona = getPersona(personaId);
  if (!persona) {
    return NextResponse.json({ error: 'Unknown persona' }, { status: 400 });
  }

  // Build the conversation history for the model
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `${persona.systemPrompt}

RAPPORT CONTEXT: The conversation rapport is currently ${rapportTrend}. ${
  rapportTrend === 'improving'
    ? 'You are warming up and becoming slightly more cooperative and open.'
    : rapportTrend === 'declining'
    ? 'You are becoming more guarded and resistant.'
    : 'You are maintaining your baseline personality.'
}

TURN ${turnCount}: ${
  turnCount <= 2
    ? 'This is early in the conversation — stay in your opening character.'
    : turnCount <= 6
    ? 'The conversation is developing — respond naturally based on what has been said.'
    : turnCount <= 12
    ? 'The conversation has gone on a while — it is natural to have formed clearer opinions about this agent.'
    : 'This is a long conversation — you should have a clear sense of whether you trust this agent.'
}

CRITICAL RULES:
1. NEVER break character or acknowledge being an AI
2. NEVER say "As an AI..." or similar
3. Keep your response to 1-4 sentences unless you are the Talkative persona
4. React to what was ACTUALLY SAID in the conversation above — don't ignore it
5. If the agent repeated a question you already answered, react to the repetition naturally
6. Never be scripted — vary your phrasing, show personality, be unpredictable
7. Only output the prospect's words — no stage directions, no labels, just the spoken response`,
    },
  ];

  // Inject conversation history
  for (const msg of messages) {
    chatMessages.push({
      role: msg.role === 'agent' ? 'user' : 'assistant',
      content: msg.text,
    });
  }

  // Stream the response
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: chatMessages,
    max_tokens: 200,
    temperature: 0.85,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(delta));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
