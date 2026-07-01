import { NextResponse } from 'next/server';

/**
 * This endpoint is no longer used.
 * Transcription now goes through /api/transcribe, which calls Deepgram's
 * pre-recorded REST API server-side. No ephemeral keys are created.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Use /api/transcribe for server-side transcription.' },
    { status: 410 }
  );
}
