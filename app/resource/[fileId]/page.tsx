export const dynamic='force-dynamic';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';
import { typeLabel } from '@/lib/resource-utils';
import { ResourceActions } from '@/components/resource-actions';
import { ResourcePreview } from './resource-preview';
export default async function Page({params}:{params:Promise<{fileId:string}>}){const {membership}=await requireMember(); const {fileId}=await params; if(!(await assertInsideRoot(fileId))) return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="p-8">Not found</main></>; const meta=await getDriveMetadata(fileId); if(!meta) return null; return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-7xl px-4 py-6"><div className="mb-4 rounded-2xl border border-blue-100 bg-[color:var(--dp-warm-surface)] p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/library" className="text-sm text-[color:var(--dp-blue)] hover:underline">Library</Link><h1 className="mt-1 text-2xl font-semibold text-[color:var(--dp-navy)]">{meta.name}</h1><p className="text-sm text-[color:var(--dp-ink)]/65">{typeLabel(meta.mimeType,meta.isFolder)}</p></div><ResourceActions resource={{driveFileId:fileId,resourceName:meta.name,resourcePath:'Library'}} downloadHref={!meta.isFolder?`/api/files/${fileId}/download`:undefined}/></div></div><ResourcePreview fileId={fileId} mimeType={meta.mimeType} name={meta.name}/></main></>}
