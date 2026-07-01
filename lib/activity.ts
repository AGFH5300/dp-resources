import { headers } from 'next/headers';
import { createSupabaseAdminClient, isSupabaseConfigured } from './supabase';
import type { ActivityLog } from './types';
export async function recordActivity(input:{userId:string;userEmail:string;fileId?:string|null;fileName:string;action:ActivityLog['action']}){
 if(!isSupabaseConfigured()||!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
 const h=await headers();
 await createSupabaseAdminClient().from('dp_resource_activity_logs').insert({user_id:input.userId,user_email:input.userEmail,file_id:input.fileId,file_name:input.fileName,action:input.action,ip_address:h.get('x-forwarded-for')?.split(',')[0]||null,user_agent:h.get('user-agent')});
}
