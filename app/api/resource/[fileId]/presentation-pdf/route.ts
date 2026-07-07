import { mkdir, mkdtemp, rm, stat, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveMediaFetch } from '@/lib/drive';
import { PPTX_MIME } from '@/lib/presentation-pdf';
import { parseSingleByteRange } from '@/lib/range-requests';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const cacheRoot=path.join(tmpdir(),'dp-presentation-pdf-cache');
const inFlight=new Map<string,Promise<string>>();
const MIN_PDF_BYTES=1024;
const CONVERSION_TIMEOUT_MS=60_000;

function safeKey(fileId:string,modified:string){return `${fileId}-${modified||'unknown'}`.replace(/[^a-zA-Z0-9._-]/g,'_');}
async function validPdf(file:string){try{const buf=await readFile(file); return buf.length>=MIN_PDF_BYTES && buf.subarray(0,5).toString('utf8')==='%PDF-';}catch{return false;}}
function runSoffice(args:string[]){return new Promise<void>((resolve,reject)=>{let stdout=''; let stderr=''; const p=spawn('soffice',args,{shell:false,stdio:['ignore','pipe','pipe']}); const timer=setTimeout(()=>{p.kill('SIGKILL'); reject(new Error('Conversion timed out'));},CONVERSION_TIMEOUT_MS); p.stdout.on('data',d=>{stdout=(stdout+d.toString()).slice(-4000);}); p.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);}); p.on('error',err=>{clearTimeout(timer); reject(err);}); p.on('exit',c=>{clearTimeout(timer); c===0?resolve():reject(new Error(`Conversion failed ${c}: ${stdout} ${stderr}`));});});}
async function convert(fileId:string,modified:string){const key=safeKey(fileId,modified); const out=path.join(cacheRoot,`${key}.pdf`); if(await validPdf(out))return out; const existing=inFlight.get(key); if(existing)return existing; const promise=(async()=>{await mkdir(cacheRoot,{recursive:true}); const inputDir=await mkdtemp(path.join(tmpdir(),'dp-pptx-input-')); const profileDir=await mkdtemp(path.join(tmpdir(),'dp-pptx-profile-')); try{const input=path.join(inputDir,'input.pptx'); const res=await getDriveMediaFetch(fileId); if(!res.ok)throw new Error('Preview unavailable'); await writeFile(input, Buffer.from(await res.arrayBuffer())); await runSoffice(['--headless','--nologo','--nodefault','--nofirststartwizard','--nolockcheck',`-env:UserInstallation=${pathToFileURL(profileDir).href}`,'--convert-to','pdf:impress_pdf_Export','--outdir',inputDir,input]); const generated=path.join(inputDir,'input.pdf'); if(!(await validPdf(generated)))throw new Error('Converted PDF failed validation'); await copyFile(generated,out); return out;} finally {inFlight.delete(key); await Promise.allSettled([rm(inputDir,{recursive:true,force:true}),rm(profileDir,{recursive:true,force:true})]);}})(); inFlight.set(key,promise); return promise;}
export async function GET(req:Request,{params}:{params:Promise<{fileId:string}>}){await requireMember(); const {fileId}=await params; if(!(await assertInsideRoot(fileId)))return new Response('Not found',{status:404}); const meta=await getDriveMetadata(fileId); if(!meta||meta.isFolder||!(meta.mimeType===PPTX_MIME||/\.pptx$/i.test(meta.name)))return new Response('Not found',{status:404}); try{const pdf=await convert(fileId,meta.modifiedTime||''); const st=await stat(pdf); const size=st.size; const etag=`"pptx-${safeKey(fileId,meta.modifiedTime||String(st.mtimeMs))}-${size}"`; const base={'content-type':'application/pdf','cache-control':'private, max-age=86400','vary':'Cookie','accept-ranges':'bytes','etag':etag}; const requestedRange=req.headers.get('range'); if(!requestedRange && req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:base}); const range=parseSingleByteRange(requestedRange,size); if(range.kind==='invalid')return new Response(null,{status:416,headers:{...base,'content-range':`bytes */${size}`}}); const buf=await readFile(pdf); if(range.kind==='range'){const body=buf.subarray(range.start,range.end+1); return new Response(body,{status:206,headers:{...base,'content-length':String(body.length),'content-range':`bytes ${range.start}-${range.end}/${size}`}});} return new Response(buf,{headers:{...base,'content-length':String(size)}});}catch{return new Response('Preview unavailable',{status:502});}}
