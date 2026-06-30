import { NextRequest, NextResponse } from 'next/server';
import { listPendingIndex, getFullEntry } from '@/lib/pipeline/knowledge-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const entry = await getFullEntry(id);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ entry });
  }

  const filter = (searchParams.get('filter') ?? 'pending') as 'all' | 'pending' | 'approved' | 'rejected';
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50');

  const { entries, total } = await listPendingIndex(filter, page, pageSize);
  return NextResponse.json({ entries, total, page, pageSize });
}
