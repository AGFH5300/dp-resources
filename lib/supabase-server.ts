import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return { supabaseUrl, supabaseKey };
}

export function isSupabaseConfigured() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();
  return Boolean(supabaseUrl && supabaseKey);
}

export async function createSupabaseServerClient() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase public configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {}
      },
    },
  });
}

export const createClient = createSupabaseServerClient;
