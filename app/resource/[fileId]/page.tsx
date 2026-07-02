export const dynamic='force-dynamic';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';
import { typeLabel } from '@/lib/resource-utils';
import { ResourceActions } from '@/components/resource-actions';
import { ResourcePreview } from './resource-preview';
import { isFeaturedResource } from '@/lib/featured-resources';
import { EssentialMarker } from '@/components/essential-marker';
export default async function Page({params}:{params:Promise<{fileId:string}>}){const {membership}=await requireMember(); const {fileId}=await params; if(!(await assertInsideRoot(fileId))) return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="p-8">Not found</main></>; const meta=await getDriveMetadata(fileId); if(!meta) return null; const featured=await isFeaturedResource(fileId); return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-7xl px-4 py-5"><div className="mb-3 border-b border-slate-200 pb-3"><nav className="text-sm text-slate-500"><Link href="/library" className="font-medium text-[color:var(--dp-blue)] hover:underline">Library</Link><span> / </span><span>Preview</span></nav><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-lg font-semibold text-[color:var(--dp-navy)]">{meta.name}</h1><span className="mt-1 inline-flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{typeLabel(meta.mimeType,meta.isFolder)}</span>{featured&&<EssentialMarker label="Essential resource"/>}</span></div><ResourceActions resource={{driveFileId:fileId,resourceName:meta.name,resourcePath:'Library', mimeType: meta.mimeType}} downloadHref={!meta.isFolder?`/api/files/${fileId}/download`:undefined} openHref={`/api/resource/${fileId}/content`}/></div></div><ResourcePreview fileId={fileId} mimeType={meta.mimeType} name={meta.name}/></main></>}
