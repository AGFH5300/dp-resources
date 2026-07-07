import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';
import type { DriveItem } from './types';

function syncComplete(state:any){return state?.status==='complete'&&Boolean(state?.completed_at)&&(!Array.isArray(state?.folder_queue)||state.folder_queue.length===0);}
export async function getIndexedResourceShell(fileId:string):Promise<(DriveItem & {path?:string})|null>{
  const sb=createSupabaseAdminClient();
  const {data:state}=await sb.from('dp_resource_index_sync_state').select('status,completed_at,folder_queue').limit(1).maybeSingle();
  if(!syncComplete(state))return null;
  const {data}=await sb.from('dp_resource_index').select('drive_file_id,name,mime_type,is_folder,size_bytes,modified_at,path').eq('drive_file_id',fileId).maybeSingle();
  if(!data)return null;
  return {id:data.drive_file_id,name:data.name,mimeType:data.mime_type,isFolder:data.is_folder,size:data.size_bytes?String(data.size_bytes):undefined,modifiedTime:data.modified_at||undefined,path:data.path};
}
