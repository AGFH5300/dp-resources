import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { user } = await requireMember();
  const { driveFileId } = await req.json();
  if (!driveFileId) return Response.json({ error: 'Missing driveFileId' }, { status: 400 });
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from('dp_resource_onboarding_dismissals').upsert({ user_id: user.id, key: `start_here:${driveFileId}` }, { onConflict: 'user_id,key' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
