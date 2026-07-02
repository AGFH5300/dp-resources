import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
export const dynamic='force-dynamic';
export async function POST(req:Request){const {user}=await requireMember(); const body=await req.json(); const sb=createSupabaseAdminClient(); const {error}=await sb.from('dp_support_tickets').insert({reporter_id:user.id,reporter_email:user.email,category:body.category,subject:body.subject,message:body.message}); if(error)return Response.json({error:error.message},{status:500}); return Response.json({ok:true});}
