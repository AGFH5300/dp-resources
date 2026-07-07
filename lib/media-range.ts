import 'server-only';
import { getDriveMediaFetch } from './drive';
import { safeDownloadName } from './drive';

export async function fetchDriveMediaResponse(fileId:string,mimeType:string,name:string,range?:string){
  const upstream=await getDriveMediaFetch(fileId,range);
  const headers=new Headers({
    'content-type': upstream.headers.get('content-type') || mimeType,
    'cache-control':'private, max-age=300, must-revalidate',
    'vary':'Cookie',
    'accept-ranges':'bytes',
    'content-disposition':`inline; filename="${safeDownloadName(name)}"`,
  });
  for(const h of ['content-length','content-range','etag','last-modified']){const v=upstream.headers.get(h); if(v)headers.set(h,v);}
  return new Response(upstream.body,{status:upstream.status,headers});
}
