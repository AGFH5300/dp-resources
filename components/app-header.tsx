'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  BookOpenCheck,
  Clock,
  Headphones,
  Search,
  Star,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { AccountMenu } from './account-menu';
import { BrandWordmark } from './brand-wordmark';
import { SuspensionWatcher } from './suspension-watcher';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand-mark';
import {
  NotificationBadge,
  NotificationCenter,
  useNotificationFeed,
} from './notification-center';

export function AppHeader({
  admin = false,
  username: initialUsername = null,
  userId,
}: {
  admin?: boolean;
  username?: string | null;
  userId?: string | null;
}) {
  const pathname = usePathname();
  const [shortcutModifier, setShortcutModifier] = useState('Ctrl');
  const [username, setUsername] = useState(initialUsername?.trim() || null);
  const notificationFeed = useNotificationFeed(Boolean(userId));
  const adminUnread = admin
    ? notificationFeed.summary.adminTickets +
      notificationFeed.summary.adminReports
    : 0;

  useEffect(() => {
    const isAppleDevice =
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
      /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(navigator.userAgent);

    setShortcutModifier(isAppleDevice ? '⌘' : 'Ctrl');
  }, []);

  useEffect(() => {
    setUsername(initialUsername?.trim() || null);
    if (!userId) return;

    let cancelled = false;
    const supabase = createClient();

    void supabase
      .from('dp_resource_profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle<{ username: string }>()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[app-header] username lookup failed', {
            code: error.code,
            message: error.message,
          });
          return;
        }
        setUsername(data?.username?.trim() || null);
      });

    return () => {
      cancelled = true;
    };
  }, [initialUsername, userId]);

  const links: Array<[string, string, number]> = [
    ['/library', 'Library', 0],
    ['/question-bank', 'Question Bank', 0],
    ['/recent', 'Recent', 0],
    ['/saved', 'Saved', 0],
    ['/support', 'Support', notificationFeed.summary.userTickets],
    ...(admin
      ? ([['/admin', 'Admin', adminUnread]] as Array<[
          string,
          string,
          number,
        ]>)
      : []),
  ];

  const mobile = [
    ['/library', 'Library', BookOpen],
    ['/question-bank', 'Questions', BookOpenCheck],
    ['/search', 'Search', Search],
    ['/recent', 'Recent', Clock],
    ['/saved', 'Saved', Star],
    ['/support', 'Support', Headphones],
  ] as const;

  return (
    <>
      <SuspensionWatcher userId={userId} />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-[color:var(--dp-warm-surface)]/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
          <Link
            href="/library"
            aria-label="DP Resources"
            className="shrink-0 sm:hidden"
          >
            <BrandMark className="size-10" />
          </Link>

          <BrandWordmark
            href="/library"
            className="hidden shrink-0 text-base sm:inline-flex sm:text-lg"
          />

          <nav
            aria-label="Primary navigation"
            className="hidden items-stretch gap-1 self-stretch md:flex"
          >
            {links.map(([href, label, unread]) => {
              const active =
                pathname === href ||
                (href !== '/library' && pathname.startsWith(href));

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-1.5 px-2 text-sm font-medium text-slate-600 hover:text-[color:var(--dp-navy)]"
                >
                  {label}
                  <NotificationBadge count={unread} />
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('dp:open-search'))}
            className="hidden h-9 w-72 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 hover:border-slate-300 md:flex"
            aria-label={`Search library (${shortcutModifier} K)`}
          >
            <Search className="size-4" />
            <span className="truncate">Search library…</span>

            <kbd className="ml-auto rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]">
              {shortcutModifier} K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('dp:open-search'))}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Search library"
          >
            <Search className="size-5" />
          </button>

          <ThemeToggle />
          {userId && (
            <NotificationCenter
              notifications={notificationFeed.notifications}
              summary={notificationFeed.summary}
              loading={notificationFeed.loading}
              onRefresh={notificationFeed.refresh}
            />
          )}
          <AccountMenu
            admin={admin}
            adminUnread={adminUnread}
            username={username}
          />
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-[color:var(--dp-warm-surface)] md:hidden"
        aria-label="Mobile navigation"
      >
        {mobile.map(([href, label, Icon]) => {
          const active =
            pathname === href ||
            (href !== '/library' && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center gap-1 py-2 text-[11px] text-slate-600"
            >
              <span className="relative">
                <Icon className="size-4" />
                {href === '/support' &&
                  notificationFeed.summary.userTickets > 0 && (
                    <span className="absolute -right-4 -top-3">
                      <NotificationBadge
                        count={notificationFeed.summary.userTickets}
                      />
                    </span>
                  )}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
