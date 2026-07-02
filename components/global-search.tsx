'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Folder, Search, X } from 'lucide-react';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import type { ResourceIndex } from '@/lib/types';

type Result = ResourceIndex;

function mark(text: string, q: string) {
  const part = q.trim();
  if (!part) return text;
  const idx = text.toLowerCase().indexOf(part.toLowerCase());
  if (idx < 0) return text;
  return <>{text.slice(0, idx)}<mark className="bg-amber-100 text-amber-950">{text.slice(idx, idx + part.length)}</mark>{text.slice(idx + part.length)}</>;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const [folders, setFolders] = useState<Result[]>([]); const [files, setFiles] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false); const [slow, setSlow] = useState(false); const [error, setError] = useState('');
  const [active, setActive] = useState(0); const input = useRef<HTMLInputElement>(null);
  const flat = useMemo(() => [...folders, ...files], [folders, files]);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('dp:open-search', f); return () => window.removeEventListener('dp:open-search', f); }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setFolders([]); setFiles([]); setLoading(false); return; }
    const ac = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setSlow(false); setError(''); const slowTimer = setTimeout(() => setSlow(true), 800);
      try { const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal }); if (!res.ok) throw new Error('Search failed'); const data = await res.json(); setFolders(data.folders || []); setFiles(data.files || []); setActive(0); }
      catch (err) { if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Search failed'); }
      finally { clearTimeout(slowTimer); if (!ac.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [q, open]);
  if (!open) return null;
  const choose = flat[active];
  return <div className="fixed inset-0 z-50 bg-slate-950/20 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3"><Search className="size-5 text-slate-400" /><input ref={input} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,flat.length-1));} if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));} if(e.key==='Enter'&&choose){ location.href=resourceUrl({drive_file_id:choose.drive_file_id,is_folder:choose.is_folder});}}} placeholder="Search names, folders, paths, and types" className="flex-1 bg-transparent text-base outline-none" /><button onClick={()=>setOpen(false)}><X className="size-5" /></button></div>
      <div className="max-h-[65vh] overflow-y-auto p-3">
        {q.length < 2 ? <p className="p-8 text-center text-sm text-slate-500">Type at least two characters to search the indexed library.</p> : loading ? <p className="p-8 text-center text-sm text-slate-500">{slow ? 'Still searching…' : 'Searching your library…'}</p> : error ? <div className="p-8 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={()=>setQ(q+' ')} className="mt-2 text-sm font-medium text-amber-800">Retry</button></div> : !flat.length ? <p className="p-8 text-center text-sm text-slate-500">No indexed resources match “{q}”.</p> : <>
          {([['Folders', folders], ['Files', files]] as const).map(([label, rows]) => rows.length ? <section key={label} className="mb-3"><h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h3>{rows.map((r) => { const idx=flat.indexOf(r); return <Link onClick={()=>setOpen(false)} key={r.drive_file_id} href={resourceUrl({drive_file_id:r.drive_file_id,is_folder:r.is_folder})} className={`flex gap-3 rounded-xl p-3 ${idx===active?'bg-amber-50':'hover:bg-slate-50'}`}>{r.is_folder?<Folder className="size-5 text-amber-700"/>:<FileText className="size-5 text-slate-500"/>}<span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-950">{mark(r.name,q)}</span><span className="block truncate text-xs text-slate-500">{mark(r.path,q)} · {typeLabel(r.mime_type,r.is_folder)}</span></span></Link>;})}</section> : null)}
          <Link onClick={()=>setOpen(false)} href={`/search?q=${encodeURIComponent(q)}`} className="block rounded-xl border border-slate-200 p-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">View all results</Link>
        </>}
      </div>
    </div>
  </div>;
}
