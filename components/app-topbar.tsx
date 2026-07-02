'use client';
import Link from 'next/link';
import { useState } from 'react';
import { LogOut, Menu, Search, UserRound, X } from 'lucide-react';
import { AppSidebar } from './app-sidebar';

export function AppTopbar({admin=false,email}:{admin?:boolean;email?:string|null}){const [open,setOpen]=useState(false); return <>
 <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur md:ml-60">
  <div className="flex h-14 items-center gap-3 px-3 sm:px-5 lg:px-7">
   <button type="button" aria-label="Open navigation" onClick={()=>setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"><Menu className="size-5"/></button>
   <button onClick={()=>window.dispatchEvent(new Event('dp:open-search'))} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 hover:border-blue-200" aria-label="Search the library"><Search className="size-4"/><span className="truncate">Search the library</span><kbd className="ml-auto hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500 sm:block">Ctrl K</kbd></button>
   <div className="ml-auto flex items-center gap-2">{email?<Link href="/profile" className="hidden max-w-56 items-center gap-2 truncate rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 sm:inline-flex"><UserRound className="size-4"/>{email}</Link>:null}<form action="/api/auth/signout" method="post"><button className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><LogOut className="size-4"/>Sign out</button></form></div>
  </div>
 </header>
 <AppSidebar admin={admin}/>
 {open&&<div className="fixed inset-0 z-50 md:hidden"><button aria-label="Close navigation overlay" className="absolute inset-0 bg-slate-950/30" onClick={()=>setOpen(false)}/><div className="relative h-full w-72 border-r border-slate-200 bg-[#f8fbff] shadow-xl"><button aria-label="Close navigation" onClick={()=>setOpen(false)} className="absolute right-3 top-3 rounded-md p-2 hover:bg-slate-100"><X className="size-5"/></button><AppSidebar admin={admin} mobile onNavigate={()=>setOpen(false)}/></div></div>}
 </>}
