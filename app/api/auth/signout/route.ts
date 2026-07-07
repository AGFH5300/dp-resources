import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseServerClient } from '@/lib/supabase';
import { redirect } from 'next/navigation';
export async function POST(request: Request){const forbidden=sameOriginOrForbidden(request); if(forbidden)return forbidden;const supabase=await createSupabaseServerClient(); await supabase.auth.signOut(); redirect('/')}
