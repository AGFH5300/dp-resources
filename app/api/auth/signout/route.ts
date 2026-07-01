import { createSupabaseServerClient } from '@/lib/supabase';
import { redirect } from 'next/navigation';
export async function POST(){const supabase=await createSupabaseServerClient(); await supabase.auth.signOut(); redirect('/')}
