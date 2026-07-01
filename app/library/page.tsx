import Link from 'next/link';
import { requireApproved } from '@/lib/auth';
import { breadcrumbsToRoot, isDriveConfigured, listDriveItems, normalizeSearch, rootFolderId } from '@/lib/drive';
import { Nav } from '@/components/nav';

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireApproved();
  const sp = await searchParams;
  const folder = sp.folder || rootFolderId();
  const q = normalizeSearch(sp.q || '');
  const configured = isDriveConfigured();
  const [items, crumbs] = configured ? await Promise.all([listDriveItems(folder, q), breadcrumbsToRoot(folder)]) : [[], []];
  const active = crumbs.at(-1);
  const parent = crumbs.length > 1 ? crumbs.at(-2) : null;
  return <><Nav admin={membership.role === 'admin'} /><main className="mx-auto max-w-6xl p-4"><h1 className="text-3xl font-semibold">Library</h1>{!configured ? <p className="mt-6 rounded-xl border bg-white p-6 text-slate-600">Resources are not yet available.</p> : <><nav aria-label="Breadcrumb" className="mt-4 text-sm">{crumbs.map((c, index) => <span key={c.id}>{index > 0 && ' / '}<Link className="text-blue-700" href={c.id === rootFolderId() ? '/library' : `/library?folder=${encodeURIComponent(c.id)}`}>{index === 0 ? 'Library' : c.name}</Link></span>)}</nav>{parent && <Link className="mt-3 inline-block rounded border px-3 py-2 text-sm" href={parent.id === rootFolderId() ? '/library' : `/library?folder=${encodeURIComponent(parent.id)}`}>Up one level</Link>}<form className="mt-4"><input type="hidden" name="folder" value={active?.id || folder} /><label className="sr-only" htmlFor="q">Search by file name</label><input id="q" name="q" maxLength={100} defaultValue={q} placeholder="Search by file name" className="w-full rounded-lg border bg-white p-3" /></form>{items.length === 0 ? <p className="mt-6 rounded-xl border bg-white p-6">No resources found.</p> : <div className="mt-6 overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Name</th><th>Type</th><th>Size</th><th>Modified</th><th>Actions</th></tr></thead><tbody>{items.map((i) => <tr className="border-t" key={i.id}><td className="p-3 font-medium">{i.name}</td><td>{i.isFolder ? 'Folder' : i.mimeType}</td><td>{i.size ? `${Math.round(Number(i.size) / 1024)} KB` : '—'}</td><td>{i.modifiedTime ? new Date(i.modifiedTime).toLocaleDateString() : '—'}</td><td className="space-x-2">{i.isFolder ? <form action="/api/library/open-folder" method="post" className="inline"><input type="hidden" name="folderId" value={i.id} /><button className="text-blue-700">Open</button></form> : <><Link className="text-blue-700" href={`/api/files/${i.id}/open`}>Open</Link><Link className="text-blue-700" href={`/api/files/${i.id}/download`}>Download</Link></>}</td></tr>)}</tbody></table></div>}</>}</main></>;
}
