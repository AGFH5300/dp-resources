import Link from 'next/link';
import { BookOpen, LogOut, Shield, UserRound } from 'lucide-react';

export function Nav({ admin = false, email }: { admin?: boolean; email?: string | null }) {
  const links = [
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/profile', label: 'Profile', icon: UserRound },
    ...(admin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-[#fbfaf7]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/library" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-950">
            <span className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-[13px] shadow-sm">DP</span>
            <span>DP Resources</span>
          </Link>
          <form action="/api/auth/signout" method="post" className="sm:hidden">
            <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">Sign out</button>
          </form>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-600/30">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            {email ? <span className="max-w-48 truncate text-xs text-slate-500">{email}</span> : null}
            <form action="/api/auth/signout" method="post">
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
    </header>
  );
}
