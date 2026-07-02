'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Clock, Headphones, LogOut, Search, Shield, Star, UserRound } from 'lucide-react';

export function Nav({ admin = false, email }: { admin?: boolean; email?: string | null }) {
  const pathname = usePathname();
  const links = [
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/recent', label: 'Recent', icon: Clock },
    { href: '/saved', label: 'Saved', icon: Star },
    { href: '/support', label: 'Support', icon: Headphones },
    ...(admin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-blue-100 bg-[color:var(--dp-soft-sky)]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/library" className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-[color:var(--dp-navy)]">
            <span className="grid size-8 place-items-center rounded-md border border-blue-100 bg-[color:var(--dp-warm-surface)] text-[13px] shadow-sm">DP</span><span>DP Resources</span>
          </Link>
          <button onClick={() => window.dispatchEvent(new Event('dp:open-search'))} className="hidden min-w-0 flex-1 items-center gap-3 rounded-xl border border-blue-100 bg-[color:var(--dp-warm-surface)] px-3 py-2 text-left text-sm text-[color:var(--dp-ink)]/60 shadow-sm transition hover:border-blue-300 md:flex">
            <Search className="size-4" /> <span className="flex-1">Search the library</span><kbd className="rounded border border-slate-200 bg-blue-50 px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
          </button>
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            {email ? <Link href="/profile" className="inline-flex max-w-48 items-center gap-2 truncate rounded-lg px-2 py-1 text-xs text-[color:var(--dp-ink)]/60 hover:bg-slate-100"><UserRound className="size-4" />{email}</Link> : null}
            <form action="/api/auth/signout" method="post"><button className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-[color:var(--dp-warm-surface)] px-3 py-2 text-sm font-medium text-[color:var(--dp-ink)] shadow-sm hover:bg-blue-50"><LogOut className="size-4" /> Sign out</button></form>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex rounded-xl border border-blue-100 bg-[color:var(--dp-warm-surface)] p-1 shadow-sm">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/library' && pathname?.startsWith(href));
              return <Link key={href} href={href} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[color:var(--dp-blue)]/30 ${active ? 'bg-blue-100 text-[color:var(--dp-navy)]' : 'text-[color:var(--dp-ink)]/70 hover:bg-blue-50 hover:text-[color:var(--dp-blue)]'}`}><Icon className="size-4" />{label}</Link>;
            })}
          </div>
          <button onClick={() => window.dispatchEvent(new Event('dp:open-search'))} className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-[color:var(--dp-warm-surface)] px-3 py-2 text-sm text-slate-600 shadow-sm md:hidden"><Search className="size-4" /> Search</button>
        </div>
      </nav>
    </header>
  );
}
