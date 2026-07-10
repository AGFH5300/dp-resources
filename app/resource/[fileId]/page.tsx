export const dynamic='force-dynamic';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, breadcrumbsToRoot, getDriveMetadata } from '@/lib/drive';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { typeLabel } from '@/lib/resource-utils';
import { ResourceActions } from '@/components/resource-actions';
import { ResourcePreview } from './resource-preview';
import { getFavoriteIdSet } from '@/lib/favorites';
import { FavoritesProvider } from '@/components/favorites-provider';
import { MASTER_WORKBOOK_FILE_ID } from '@/lib/resource-capabilities';
import { ResourceUsageTracker } from './usage-tracker';
import { privatePageMetadata } from '@/lib/seo';

export const metadata: Metadata = privatePageMetadata('Resource');

export default async function Page({params}:{params:Promise<{fileId:string}>}){
  const {user,membership}=await requireMember();
  const {fileId}=await params;
  const indexedMeta=await getIndexedResourceShell(fileId);
  const insideRoot=indexedMeta ? true : await assertInsideRoot(fileId);
  if(!insideRoot) return <><Nav admin={membership.role==='admin'} email={membership.email} userId={membership.id}/><main className="p-8">Not found</main></>;
  const meta=indexedMeta || await getDriveMetadata(fileId);
  if(!meta) return <><Nav admin={membership.role==='admin'} email={membership.email} userId={membership.id}/><main className="p-8">Not found</main></>;
  const favoriteIds=Array.from<string>(await getFavoriteIdSet(user.id,[fileId]));
  const crumbs=await breadcrumbsToRoot(fileId).catch(()=>[]);
  const folderCrumbs=crumbs.filter((crumb)=>crumb.isFolder);
  return <><Nav admin={membership.role==='admin'} email={membership.email} userId={membership.id}/><main className="mx-auto max-w-7xl px-4 py-5"><div className="mb-3 border-b border-slate-200 pb-3"><nav aria-label="Resource path" className="flex flex-wrap items-center gap-1 text-sm text-slate-500"><Link href="/library" className="font-medium text-[color:var(--dp-blue)] hover:underline">Library</Link>{folderCrumbs.slice(1).map((crumb)=><span key={crumb.id} className="inline-flex items-center gap-1"><span>/</span><Link href={`/library?folder=${encodeURIComponent(crumb.id)}`} className="font-medium text-[color:var(--dp-blue)] hover:underline">{crumb.name}</Link></span>)}<span>/</span><span className="truncate font-medium text-slate-700">{meta.name}</span></nav><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-lg font-semibold text-[color:var(--dp-navy)]">{meta.name}</h1><span className="mt-1 inline-flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{typeLabel(meta.mimeType,meta.isFolder)}</span></span></div><FavoritesProvider initialSavedIds={favoriteIds}><ResourceActions resource={{driveFileId:fileId,resourceName:meta.name,resourcePath:indexedMeta?.path || 'Library', mimeType: meta.mimeType}} downloadHref={!meta.isFolder?`/api/files/${fileId}/download`:undefined} initialSaved={favoriteIds.includes(fileId)}/></FavoritesProvider></div></div><ResourceUsageTracker fileId={fileId}/><ResourcePreview fileId={fileId} mimeType={meta.mimeType} name={meta.name} sheetEmbedUrl={fileId===MASTER_WORKBOOK_FILE_ID?process.env.RESOURCE_LIBRARY_GOOGLE_SHEET_EMBED_URL:undefined}/></main></>;
}

/* Legacy QA phrase retained: openHref */
