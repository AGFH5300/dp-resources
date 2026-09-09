import { signedAccountAvatarUrl } from '@/lib/account-avatar';
import { requireApiMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const { data, error } = await createSupabaseAdminClient()
    .from('dp_resource_profiles')
    .select('username,avatar_path')
    .eq('id', context.user.id)
    .maybeSingle<{ username: string | null; avatar_path: string | null }>();
  if (error) {
    return Response.json(
      { error: 'Unable to load account profile.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  return Response.json(
    {
      username: data?.username?.trim() || null,
      avatarUrl: await signedAccountAvatarUrl(data?.avatar_path),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
