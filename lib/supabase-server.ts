import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseServerConfig } from './supabase-config';

export function isSupabaseConfigured() {
  const { supabaseUrl, supabaseKey } = getSupabaseServerConfig();
  return Boolean(supabaseUrl && supabaseKey);
}

export async function createSupabaseServerClient() {
  const { supabaseUrl, supabaseKey } = getSupabaseServerConfig();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing server-side Supabase URL or publishable-key configuration.',
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
