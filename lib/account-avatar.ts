import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const ACCOUNT_AVATAR_BUCKET = 'dp-resource-avatars';
export const ACCOUNT_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export async function signedAccountAvatarUrl(path: string | null | undefined) {
  const normalized = path?.trim();
  if (!normalized) return null;
  const { data, error } = await createSupabaseAdminClient()
    .storage
    .from(ACCOUNT_AVATAR_BUCKET)
    .createSignedUrl(normalized, 60 * 60);
  if (error) {
    console.error('Unable to create account avatar URL.', { message: error.message });
    return null;
  }
  return data.signedUrl;
}
