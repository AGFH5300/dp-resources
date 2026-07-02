import { requireAdmin } from '@/lib/auth';
import { isDriveConfigured } from '@/lib/drive';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getIndexSyncStatus, INDEX_SYNC_STATE_ID, runIndexSyncChunk } from '@/lib/index-sync';
export const dynamic='force-dynamic';
async function recoverStaleLock(){const status=await getIndexSyncStatus(); const state=status.state; if(state?.status==='indexing'&&state.lock_expires_at&&new Date(state.lock_expires_at).getTime()<=Date.now()){const sb=createSupabaseAdminClient(); await sb.from('dp_resource_index_sync_state').update({status:'failed',lock_token:null,lock_expires_at:null,updated_at:new Date().toISOString(),error_message:'Indexing paused after the previous lock expired.'}).eq('id',INDEX_SYNC_STATE_ID).eq('lock_token',state.lock_token); return getIndexSyncStatus();} return status;}
export async function GET(){await requireAdmin(); return Response.json(await recoverStaleLock());}
export async function POST(){await requireAdmin(); if(!isDriveConfigured())return Response.json({error:'Drive not configured'},{status:503}); try{return Response.json(await runIndexSyncChunk());}catch(e){return Response.json({error:e instanceof Error?e.message:'Index sync failed'},{status:500});}}
