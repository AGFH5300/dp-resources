import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveMediaFetch } from '@/lib/drive';
import { PPTX_MIME } from '@/lib/presentation-pdf';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const cacheRoot=path.join(tmpdir(),'dp-presentation-pdf-cache');
const inFlight=new Map<string,Promise<string>>();

function runSoffice(args:string[]){return new Promise<void>((resolve,reject)=>{const p=spawn('soffice',args,{shell:false,stdio:'ignore'}); p.on('error',reject); p.on('exit',c=>c===0?resolve():reject(new Error('Preview unavailable')));});}
async function convert(fileId:string,modified:string){const key=`${fileId}-${modified||'unknown'}`.replace(/[^a-zA-Z0-9._-]/g,'_'); const out=path.join(cacheRoot,`${key}.pdf`); if(await stat(out).then(()=>true).catch(()=>false))return out; const existing=inFlight.get(key); if(existing)return existing; const promise=(async()=>{await mkdir(cacheRoot,{recursive:true}); const dir=await mkdtemp(path.join(tmpdir(),'dp-pptx-')); try{const input=path.join(dir,'input.pptx'); const res=await getDriveMediaFetch(fileId); if(!res.ok)throw new Error('Preview unavailable'); const {writeFile}=await import('node:fs/promises'); await writeFile(input, Buffer.from(await res.arrayBuffer())); await runSoffice(['--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',dir,input]); const generated=path.join(dir,'input.pdf'); const {copyFile}=await import('node:fs/promises'); await copyFile(generated,out); return out;} finally {inFlight.delete(key); rm(dir,{recursive:true,force:true}).catch(()=>undefined);}})(); inFlight.set(key,promise); return promise;}
export async function GET(_req:Request,{params}:{params:Promise<{fileId:string}>}){await requireMember(); const {fileId}=await params; if(!(await assertInsideRoot(fileId)))return new Response('Not found',{status:404}); const meta=await getDriveMetadata(fileId); if(!meta||meta.isFolder||!(meta.mimeType===PPTX_MIME||/\.pptx$/i.test(meta.name)))return new Response('Not found',{status:404}); try{const pdf=await convert(fileId,meta.modifiedTime||''); const {readFile}=await import('node:fs/promises'); const buf=await readFile(pdf); return new Response(buf,{headers:{'content-type':'application/pdf','content-length':String(buf.length),'cache-control':'private, max-age=86400','vary':'Cookie'}});}catch{return new Response('Preview unavailable',{status:502});}}
