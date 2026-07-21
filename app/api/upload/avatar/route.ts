import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bucket = req.nextUrl.searchParams.get('bucket') ?? 'avatars';
  const pathParam = req.nextUrl.searchParams.get('path') ?? `${user.id}/avatar`;

  // Force path to be under user's own folder to enforce RLS
  const safePath = `${user.id}/${pathParam.split('/').pop() ?? 'upload'}`;

  const contentType = req.headers.get('content-type') ?? 'image/png';
  const buffer = Buffer.from(await req.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucket)
    .upload(safePath, buffer, { contentType, upsert: true });

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(safePath);

  // Persist URL to the users table based on path type
  const field = pathParam.includes('agency') || pathParam.includes('logo')
    ? 'agency_logo_url'
    : 'avatar_url';

  await (supabase as any)
    .from('users')
    .update({ [field]: publicUrl })
    .eq('id', user.id);

  return NextResponse.json({ url: publicUrl, field });
}
