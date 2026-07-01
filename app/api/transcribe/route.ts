import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  const audioBuffer = await req.arrayBuffer();
  if (!audioBuffer.byteLength) {
    return NextResponse.json({ transcript: '', words: [] });
  }

  // Normalize Content-Type: strip codec parameters (Deepgram only accepts the base type)
  const rawContentType = req.headers.get('content-type') ?? 'audio/webm';
  const contentType = rawContentType.split(';')[0].trim();

  console.log('[transcribe] chunk — userId:', user.id,
    '| bytes:', audioBuffer.byteLength,
    '| contentType:', contentType);

  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
  });

  try {
    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    });

    const dgText = await dgRes.text().catch(() => '');
    console.log('[transcribe] Deepgram response — status:', dgRes.status,
      '| body preview:', dgText.slice(0, 200));

    if (!dgRes.ok) {
      console.error('[transcribe] Deepgram error — status:', dgRes.status, '| body:', dgText.slice(0, 300));
      return NextResponse.json(
        { error: `Deepgram transcription failed (HTTP ${dgRes.status}): ${dgText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    let data: { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: DeepgramWord[]; confidence?: number }> }> } };
    try {
      data = JSON.parse(dgText);
    } catch {
      console.error('[transcribe] JSON parse failed — body:', dgText.slice(0, 200));
      return NextResponse.json({ error: 'Invalid JSON from Deepgram' }, { status: 502 });
    }

    const alternative = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative) {
      return NextResponse.json({ transcript: '', words: [] });
    }

    console.log('[transcribe] success — transcript length:', alternative.transcript?.length ?? 0,
      '| words:', alternative.words?.length ?? 0);

    return NextResponse.json({
      transcript: alternative.transcript ?? '',
      words: alternative.words ?? [],
      confidence: alternative.confidence ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transcribe] fetch threw:', msg);
    return NextResponse.json({ error: `Network error reaching Deepgram: ${msg}` }, { status: 500 });
  }
}
