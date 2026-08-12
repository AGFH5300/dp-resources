import 'server-only';

function runtimeEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function getSupabaseServerConfig() {
  const supabaseUrl =
    runtimeEnv('SUPABASE_URL') ||
    runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey =
    runtimeEnv('SUPABASE_PUBLISHABLE_KEY') ||
    runtimeEnv('SUPABASE_ANON_KEY') ||
    runtimeEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
    runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return { supabaseUrl, supabaseKey };
}

export function requireSupabaseUrl() {
  const { supabaseUrl } = getSupabaseServerConfig();
  if (!supabaseUrl) {
    throw new Error('Missing server-side Supabase URL configuration.');
  }
  return supabaseUrl;
}
