import { createSupabaseServerClient } from '@/lib/supabase';
import { AppHeader } from './app-header';

// AppTopbar retired; integrated header owns "Search the library" via dp:open-search and var(--dp-navy) visual tokens.
export async function Nav({
  admin = false,
  userId,
}: {
  admin?: boolean;
  email?: string | null;
  userId?: string | null;
}) {
  let username: string | null = null;

  if (userId) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('dp_resource_profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle<{ username: string }>();

      if (error) {
        console.error('[nav] username lookup failed', {
          code: error.code,
          message: error.message,
        });
      } else {
        username = data?.username?.trim() || null;
      }
    } catch (error) {
      console.error('[nav] username lookup failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return <AppHeader admin={admin} username={username} userId={userId} />;
}
