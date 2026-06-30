import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/pipeline/knowledge-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? undefined;
  const type = searchParams.get('type') ?? undefined;
  const targetFile = searchParams.get('file') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '30');

  const { results, total } = await searchKnowledge(
    query,
    { status, type, targetFile },
    page,
    pageSize
  );

  return NextResponse.json({ results, total, page, pageSize, query });
}
