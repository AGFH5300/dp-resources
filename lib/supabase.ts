import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import 'server-only';
import type { Profile } from './types';

export function isSupabaseConfigured(){return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}
export async function createSupabaseServerClient(){
 const store=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll(){return store.getAll()},setAll(cs){cs.forEach(c=>store.set(c.name,c.value,c.options))}}});
}
export function createSupabaseAdminClient(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})}
export function adminEmails(){return (process.env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean)}
export async function getSessionProfile(){
 if(!isSupabaseConfigured()) return {user:null,profile:null};
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user?.email) return {user:null,profile:null};
 const {data:profile}=await supabase.from('profiles').select('*').eq('id',user.id).single<Profile>();
 const isEnvAdmin=adminEmails().includes(user.email.toLowerCase());
 return {user,profile:profile?{...profile,role:isEnvAdmin?'admin':profile.role,is_approved:isEnvAdmin?true:profile.is_approved}:null};
}
export function createClientSupabase(){return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)}
