import { requireAdmin } from '@/lib/auth';
import { isDriveConfigured } from '@/lib/drive';
import { getIndexSyncStatus, runIndexSyncChunk } from '@/lib/index-sync';
export const dynamic='force-dynamic';
export async function GET(){await requireAdmin(); return Response.json(await getIndexSyncStatus());}
export async function POST(){await requireAdmin(); if(!isDriveConfigured())return Response.json({error:'Drive not configured'},{status:503}); try{return Response.json(await runIndexSyncChunk());}catch(e){return Response.json({error:e instanceof Error?e.message:'Index sync failed'},{status:500});}}
