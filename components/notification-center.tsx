'use client';

import { Bell, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppNotification,
  NotificationSummary,
} from '@/lib/types';

const emptySummary: NotificationSummary = {
  unread: 0,
  adminTickets: 0,
  adminReports: 0,
  userTickets: 0,
};

export function NotificationBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function useNotificationFeed(enabled = true) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>(emptySummary);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch('/api/notifications', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) return;
      setNotifications(json.notifications || []);
      setSummary(json.summary || emptySummary);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    const onFocus = () => void refresh();
    const onChanged = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('dp:notifications-changed', onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('dp:notifications-changed', onChanged);
    };
  }, [enabled, refresh]);

  return { notifications, summary, loading, refresh };
}

export async function markNotificationCategory(
  category: 'admin_tickets' | 'admin_reports' | 'user_tickets',
) {
  const response = await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  if (response.ok)
    window.dispatchEvent(new Event('dp:notifications-changed'));
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationCenter({
  notifications,
  summary,
  loading,
  onRefresh,
}: {
  notifications: AppNotification[];
  summary: NotificationSummary;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  async function markRead(notification: AppNotification) {
    if (!notification.read_at) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notification.id }),
      });
      window.dispatchEvent(new Event('dp:notifications-changed'));
    }
    setOpen(false);
    router.push(notification.href);
  }

  async function markAllRead() {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (response.ok) {
      await onRefresh();
      window.dispatchEvent(new Event('dp:notifications-changed'));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={
          summary.unread
            ? `Notifications, ${summary.unread} unread`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <Bell className="size-5" />
        {summary.unread > 0 && (
          <span className="absolute -right-2 -top-2">
            <NotificationBadge count={summary.unread} />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed left-3 right-3 top-[4.5rem] z-50 max-h-[min(70vh,34rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-semibold text-[color:var(--dp-navy)]">
                Notifications
              </p>
              <p className="text-xs text-slate-500">
                {summary.unread
                  ? `${summary.unread} unread update${summary.unread === 1 ? '' : 's'}`
                  : 'You are all caught up'}
              </p>
            </div>
            {summary.unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--dp-blue)] hover:underline"
              >
                <Check className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,28rem)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" /> Loading updates…
              </div>
            ) : notifications.length ? (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => markRead(notification)}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 ${notification.read_at ? 'bg-white' : 'bg-blue-50/70'}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-300' : 'bg-red-600'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-600">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {relativeTime(notification.created_at)}
                      </span>
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
