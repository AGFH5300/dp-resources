'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Folder, Search, X } from 'lucide-react';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import type { ResourceIndex } from '@/lib/types';

type Result = ResourceIndex;
type IndexState = 'unknown' | 'ready' | 'empty' | 'preparing';
function mark(text: string, q: string) { const part = q.trim(); if (!part) return text; const idx = text.toLowerCase().indexOf(part.toLowerCase()); if (idx < 0) return text; return <>{text.slice(0, idx)}<mark className="bg-amber-100 text-amber-950">{text.slice(idx, idx + part.length)}</mark>{text.slice(idx + part.length)}</>; }
export function GlobalSearch() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [indexState,setIndexState]=useState<IndexState>('preparing');
  const [folders, setFolders] = useState<Result[]>([]); const [files, setFiles] = useState<Result[]>([]); const [loading, setLoading] = useState(false); const [slow, setSlow] = useState(false); const [error, setError] = useState(''); const [active, setActive] = useState(0); const input = useRef<HTMLInputElement>(null);
  const flat = useMemo(() => [...folders, ...files], [folders, files]);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('dp:open-search', f); return () => window.removeEventListener('dp:open-search', f); }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);
  useEffect(() => { if (!open || q.trim().length < 2) { setFolders([]); setFiles([]); setLoading(false); return; } const ac = new AbortController(); const timer = setTimeout(async () => { setLoading(true); setSlow(false); setError(''); const slowTimer = setTimeout(() => setSlow(true), 800); try { const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal }); if (!res.ok) throw new Error('Search failed'); const data = await res.json(); setIndexState(data.indexState || 'ready'); setFolders(data.folders || []); setFiles(data.files || []); setActive(0); } catch (err) { if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Search failed'); } finally { clearTimeout(slowTimer); if (!ac.signal.aborted) setLoading(false); } }, 250); return () => { clearTimeout(timer); ac.abort(); }; }, [q, open]);
  if (!open) return null; const choose = flat[active];
  return <div className="fixed inset-0 z-50 bg-[color:var(--dp-navy)]/30 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-blue-100 bg-[color:var(--dp-warm-surface)] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-blue-100 px-4 py-3"><Search className="size-5 text-[color:var(--dp-blue)]" /><input ref={input} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,flat.length-1));} if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));} if(e.key==='Enter'&&choose){ location.href=resourceUrl({drive_file_id:choose.drive_file_id,is_folder:choose.is_folder});}}} placeholder="Search names, folders, paths, and types" className="flex-1 bg-transparent text-base outline-none" /><button aria-label="Close search" onClick={()=>setOpen(false)}><X className="size-5" /></button></div>
      <div className="max-h-[65vh] overflow-y-auto p-3">
        {q.length < 2 ? <p className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65">Type at least two characters to search the indexed library. Search is being prepared. Results may be incomplete.</p> : loading ? <p className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65">{slow ? 'Still searching…' : 'Searching your library…'}</p> : error ? <div className="p-8 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={()=>setQ(q+' ')} className="mt-2 text-sm font-medium text-[color:var(--dp-blue)]">Retry</button></div> : !flat.length ? <div className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65"><p>{indexState==='empty'?'Your administrator needs to sync the library before global search is available.':`No indexed resources match “${q}”.`}</p>{indexState==='empty'&&<Link onClick={()=>setOpen(false)} href="/admin" className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 font-medium text-blue-900">Admin → Library index</Link>}</div> : <>
          {indexState==='preparing'&&<p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Search is being prepared. Results may be incomplete.</p>}
          {([['Folders', folders], ['Files', files]] as const).map(([label, rows]) => rows.length ? <section key={label} className="mb-3"><h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--dp-blue)]">{label}</h3>{rows.map((r) => { const idx=flat.indexOf(r); return <Link onClick={()=>setOpen(false)} key={r.drive_file_id} href={resourceUrl({drive_file_id:r.drive_file_id,is_folder:r.is_folder})} className={`flex gap-3 rounded-xl p-3 ${idx===active?'bg-amber-50':'hover:bg-blue-50'}`}>{r.is_folder?<Folder className="size-5 text-[color:var(--dp-gold)]"/>:<FileText className="size-5 text-[color:var(--dp-blue)]"/>}<span className="min-w-0"><span className="block truncate text-sm font-medium text-[color:var(--dp-navy)]">{mark(r.name,q)}</span><span className="block truncate text-xs text-[color:var(--dp-ink)]/60">{mark(r.path,q)} · {typeLabel(r.mime_type,r.is_folder)}</span></span></Link>;})}</section> : null)}
          <Link onClick={()=>setOpen(false)} href={`/search?q=${encodeURIComponent(q)}`} className="block rounded-xl border border-blue-100 p-3 text-center text-sm font-medium text-[color:var(--dp-blue)] hover:bg-blue-50">View all results</Link>
        </>}
      </div>
    </div>
  </div>;
}
