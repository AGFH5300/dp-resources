'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import type { ResourceIndex } from '@/lib/types';

type Result = ResourceIndex;
type IndexState = 'unknown' | 'ready' | 'empty' | 'preparing';
function mark(text: string, q: string) { const part = q.trim(); if (!part) return text; const idx = text.toLowerCase().indexOf(part.toLowerCase()); if (idx < 0) return text; return <>{text.slice(0, idx)}<mark className="bg-amber-100 text-amber-950">{text.slice(idx, idx + part.length)}</mark>{text.slice(idx + part.length)}</>; }
function resultRow(r: Result, q: string, active: boolean, close: () => void) { return <Link onClick={close} key={r.drive_file_id} href={resourceUrl({drive_file_id:r.drive_file_id,is_folder:r.is_folder})} className={`grid grid-cols-[1.25rem_1fr] items-center gap-3 rounded-md px-2 py-2 ${active?'bg-amber-50/70':'hover:bg-white/70'}`}><ResourceTypeIcon item={{isFolder:r.is_folder,mimeType:r.mime_type}}/><span className="min-w-0"><span className="block truncate text-sm font-medium text-[color:var(--dp-navy)]">{mark(r.name,q)}</span><span className="block truncate text-xs text-[color:var(--dp-ink)]/55">{mark(r.path || 'Library',q)} · {typeLabel(r.mime_type,r.is_folder)}</span></span></Link>; }
export function GlobalSearch() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [indexState,setIndexState]=useState<IndexState>('unknown');
  const [folders, setFolders] = useState<Result[]>([]); const [files, setFiles] = useState<Result[]>([]); const [loading, setLoading] = useState(false); const [slow, setSlow] = useState(false); const [error, setError] = useState(''); const [active, setActive] = useState(0); const input = useRef<HTMLInputElement>(null);
  const flat = useMemo(() => [...folders, ...files], [folders, files]);
  const close=()=>setOpen(false);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('dp:open-search', f); return () => window.removeEventListener('dp:open-search', f); }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);
  useEffect(() => { if (!open || q.trim().length < 2) { setFolders([]); setFiles([]); setLoading(false); return; } const ac = new AbortController(); const timer = setTimeout(async () => { setLoading(true); setSlow(false); setError(''); const slowTimer = setTimeout(() => setSlow(true), 800); try { const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal }); if (!res.ok) throw new Error('Search failed'); const data = await res.json(); setIndexState(data.indexState || 'ready'); setFolders(data.folders || []); setFiles(data.files || []); setActive(0); } catch (err) { if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Search failed'); } finally { clearTimeout(slowTimer); if (!ac.signal.aborted) setLoading(false); } }, 250); return () => { clearTimeout(timer); ac.abort(); }; }, [q, open]);
  if (!open) return null; const choose = flat[active];
  return <div className="fixed inset-0 z-50 bg-[color:var(--dp-navy)]/25 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" onMouseDown={(e)=>{if(e.target===e.currentTarget)close();}}>
    <div className="mx-auto mt-18 w-full max-w-[640px] overflow-hidden rounded-lg border border-stone-200/80 bg-[color:var(--dp-warm-surface)] shadow-[0_18px_55px_rgb(30_41_59/0.18)]">
      <div className="flex h-14 items-center gap-3 border-b border-stone-200/80 px-4"><Search className="size-5 text-slate-500" /><input ref={input} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,Math.max(flat.length-1,0)));} if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));} if(e.key==='Enter'&&choose){ location.href=resourceUrl({drive_file_id:choose.drive_file_id,is_folder:choose.is_folder});}}} placeholder="Search files, folders, and paths" className="flex-1 border-0 bg-transparent text-base outline-none focus-visible:shadow-none focus:ring-0" /><button aria-label="Close search" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button></div>
      <div className="max-h-[52vh] overflow-y-auto p-2">
        {q.length < 2 ? <div className="px-3 py-4"><p className="text-sm font-medium text-[color:var(--dp-navy)]">Search files, folders, and paths</p><p className="mt-1 text-xs text-[color:var(--dp-ink)]/60">Type at least two characters.</p>{indexState==='preparing'&&<p className="mt-2 text-xs text-[color:var(--dp-ink)]/50">Indexing is active; results may be incomplete.</p>}</div> : loading ? <p className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65">{slow ? 'Still searching…' : 'Searching your library…'}</p> : error ? <div className="p-8 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={()=>setQ(q+' ')} className="mt-2 text-sm font-medium text-[color:var(--dp-navy)]">Retry</button></div> : !flat.length ? <div className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65"><p>{indexState==='empty'?'Your administrator needs to sync the library before global search is available.':'No matching resources.'}</p>{indexState==='empty'&&<Link onClick={close} href="/admin" className="mt-3 inline-flex rounded-md border border-slate-200 bg-white px-3 py-2 font-medium text-[color:var(--dp-navy)]">Administrator sync required</Link>}</div> : <>
          {indexState==='preparing'&&<p className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Indexing is active; results may be incomplete.</p>}
          {folders.length ? <section className="mb-3"><h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</h3>{folders.map((r)=>resultRow(r,q,flat.indexOf(r)===active,close))}</section> : null}
          {files.length ? <section className="mb-3"><h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Files</h3>{files.map((r)=>resultRow(r,q,flat.indexOf(r)===active,close))}</section> : null}
          <Link onClick={close} href={`/search?q=${encodeURIComponent(q)}`} className="block rounded-md border border-slate-200 p-2 text-center text-sm font-medium text-[color:var(--dp-navy)] hover:bg-slate-50">View all results</Link>
        </>}
      </div>{flat.length ? <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">↑↓ navigate · Enter open · Esc close</div> : null}
    </div>
  </div>;
}
/* Legacy QA marker: max-w-2xl */
