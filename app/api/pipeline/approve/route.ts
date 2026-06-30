import { NextRequest, NextResponse } from 'next/server';
import { approveEntries, rejectEntries, editEntry } from '@/lib/pipeline/knowledge-store';
import type { ApproveAction } from '@/lib/pipeline/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ApproveAction;
    const { ids, action, note, editedContent, editedMarkdown } = body;

    if (!ids?.length) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 });
    }

    switch (action) {
      case 'approve': {
        const result = await approveEntries(ids, note);
        return NextResponse.json({ success: true, ...result });
      }

      case 'reject': {
        await rejectEntries(ids, note);
        return NextResponse.json({ success: true, rejected: ids });
      }

      case 'edit': {
        if (ids.length !== 1) {
          return NextResponse.json({ error: 'Edit supports one entry at a time' }, { status: 400 });
        }
        const updated = await editEntry(ids[0], {
          content: editedContent,
          markdownEntry: editedMarkdown,
          note,
        });
        return NextResponse.json({ success: true, entry: updated });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
