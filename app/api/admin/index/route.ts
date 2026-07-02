import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { crawlDriveIndex, isDriveConfigured } from '@/lib/drive';
export const dynamic='force-dynamic';
export async function GET(){await requireAdmin(); const sb=createSupabaseAdminClient(); const [{count},{data}]=await Promise.all([sb.from('dp_resource_index').select('id',{count:'exact',head:true}), sb.from('dp_resource_index').select('indexed_at').order('indexed_at',{ascending:false}).limit(1).maybeSingle()]); return Response.json({count:count||0,lastIndexedAt:data?.indexed_at||null});}
export async function POST(){await requireAdmin(); if(!isDriveConfigured())return Response.json({error:'Drive not configured'},{status:503}); const sb=createSupabaseAdminClient(); const result=await crawlDriveIndex({maxItems:500}); const {error}=await sb.from('dp_resource_index').upsert(result.rows,{onConflict:'drive_file_id'}); if(error)return Response.json({error:error.message},{status:500}); return Response.json({status:result.complete?'Index complete':'Indexing folders…',indexed:result.rows.length,complete:result.complete,remainingFolders:result.remainingFolders});}
