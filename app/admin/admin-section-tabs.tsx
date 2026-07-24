'use client';

import Link from 'next/link';

import {
  NotificationBadge,
  useNotificationFeed,
} from '@/components/notification-center';

type AdminSection =
  | 'index'
  | 'question-bank'
  | 'reports'
  | 'tickets'
  | 'users'
  | 'activity'
  | 'analytics'
  | 'diagnostics';

export function AdminSectionTabs({
  activeSection,
}: {
  activeSection: AdminSection;
}) {
  const notificationFeed = useNotificationFeed(true);
  const tabs: Array<{
    id: AdminSection;
    label: string;
    href: string;
    unread: number;
  }> = [
    { id: 'index', label: 'Library index', href: '/admin?section=index', unread: 0 },
    {
      id: 'question-bank',
      label: 'Question bank',
      href: '/admin/question-bank',
      unread: 0,
    },
    {
      id: 'reports',
      label: 'Resource reports',
      href: '/admin?section=reports',
      unread: notificationFeed.summary.adminReports,
    },
    {
      id: 'tickets',
      label: 'Support tickets',
      href: '/admin?section=tickets',
      unread: notificationFeed.summary.adminTickets,
    },
    { id: 'users', label: 'Users', href: '/admin?section=users', unread: 0 },
    {
      id: 'activity',
      label: 'Activity',
      href: '/admin?section=activity',
      unread: 0,
    },
    {
      id: 'analytics',
      label: 'Usage analytics',
      href: '/admin?section=analytics',
      unread: 0,
    },
    {
      id: 'diagnostics',
      label: 'Diagnostics',
      href: '/admin?section=diagnostics',
      unread: 0,
    },
  ];

  return (
    <nav
      className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 text-sm"
      aria-label="Admin sections"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={activeSection === tab.id ? 'page' : undefined}
          className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 ${
            activeSection === tab.id
              ? 'bg-slate-100 font-semibold text-[color:var(--dp-navy)]'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {tab.label}
          <NotificationBadge count={tab.unread} />
        </Link>
      ))}
    </nav>
  );
}
