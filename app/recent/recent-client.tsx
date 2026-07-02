'use client';
import Link from 'next/link'; import { useEffect,useState } from 'react';
export function RecentClient(){const [rows,setRows]=useState<any[]>([]); useEffect(()=>setRows(JSON.parse(localStorage.getItem('dp_recent')||'[]')),[]); return <div className="mt-6 rounded-xl border bg-white">{rows.map(r=><Link key={r.id} href={r.isFolder?`/library?folder=${r.id}`:`/resource/${r.id}`} className="block border-b p-4 hover:bg-slate-50"><b>{r.name}</b><p className="text-sm text-slate-500">{r.path} · {new Date(r.at).toLocaleString()}</p></Link>)}</div>}
