import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
export const dynamic='force-dynamic';
export async function POST(req:Request){const forbidden=sameOriginOrForbidden(req); if(forbidden)return forbidden;const {user}=await requireMember(); const limited=await rateLimit(privacySafeRequestKey(req,'report-create'),10,60*60*1000,'report-create'); if(!limited.ok)return Response.json({error:'Too many requests. Please try again later.'},{status:429}); const body=await req.json(); const sb=createSupabaseAdminClient(); const {error}=await sb.from('dp_resource_reports').insert({reporter_id:user.id,reporter_email:user.email,drive_file_id:body.driveFileId||null,resource_name:body.resourceName||null,resource_path:body.resourcePath||null,category:body.category,message:body.message}); if(error)return Response.json({error:error.message},{status:500}); return Response.json({ok:true});}
