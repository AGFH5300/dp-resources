'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Clock, Headphones, Search, Star } from 'lucide-react';
import { AccountMenu } from './account-menu';
import { BrandWordmark } from './brand-wordmark';
import { SuspensionWatcher } from './suspension-watcher';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand-mark';

export function AppHeader({ admin=false, email, userId }: { admin?: boolean; email?: string | null; userId?: string | null }){
 const pathname=usePathname(); const links=[['/library','Library'],['/recent','Recent'],['/saved','Saved'],['/support','Support'],...(admin?[['/admin','Admin']]:[])];
 const mobile=[['/library','Library',BookOpen],['/search','Search',Search],['/recent','Recent',Clock],['/saved','Saved',Star],['/support','Support',Headphones]] as const;
 return <><SuspensionWatcher userId={userId}/><header className="sticky top-0 z-40 border-b border-slate-200 bg-[color:var(--dp-warm-surface)]/95 backdrop-blur"><div className="flex h-16 items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8"><Link href="/library" aria-label="DP Resources" className="shrink-0 sm:hidden"><BrandMark className="size-10" /></Link><BrandWordmark href="/library" className="hidden shrink-0 text-base sm:inline-flex sm:text-lg"/><nav aria-label="Primary navigation" className="hidden items-stretch gap-1 self-stretch md:flex">{links.map(([href,label])=>{const active=pathname===href||(href!=='/library'&&pathname.startsWith(href));return <Link key={href} href={href} aria-current={active?'page':undefined} className={`flex items-center px-2 text-sm font-medium text-slate-600 hover:text-[color:var(--dp-navy)]`}>{label}</Link>})}</nav><div className="flex-1"/><button onClick={()=>window.dispatchEvent(new Event('dp:open-search'))} className="hidden h-9 w-72 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 hover:border-slate-300 md:flex" aria-label="Search library"><Search className="size-4"/><span className="truncate">Search library…</span><kbd className="ml-auto rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]">Ctrl K</kbd></button><button onClick={()=>window.dispatchEvent(new Event('dp:open-search'))} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Search library"><Search className="size-5"/></button><ThemeToggle/><AccountMenu admin={admin} email={email}/></div></header><nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-[color:var(--dp-warm-surface)] md:hidden" aria-label="Mobile navigation">{mobile.map(([href,label,Icon])=>{const active=pathname===href||(href!=='/library'&&pathname.startsWith(href));return <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-2 text-[11px] text-slate-600`}><Icon className="size-4"/>{label}</Link>})}</nav></>
}
