'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const RETURN_KEY = 'dp-admin-activity-user-return';
const RETURN_TTL_MS = 10 * 60 * 1000;

type UserLookupResult = {
  id: string;
  email: string;
};

type StoredReturn = {
  url: string;
  createdAt: number;
};

export function buildActivityUserModalUrl(
  pathname: string,
  search: string,
  userId: string,
) {
  const params = new URLSearchParams(search);
  params.set('section', 'users');
  params.set('userUsageId', userId);
  params.set('userUsageRange', params.get('userUsageRange') || 'all');
  params.delete('userPage');
  return `${pathname}?${params.toString()}`;
}

export function validActivityReturnTarget(
  raw: string | null,
  pathname: string,
  now = Date.now(),
) {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredReturn>;
    if (
      typeof stored.url !== 'string' ||
      typeof stored.createdAt !== 'number' ||
      now - stored.createdAt > RETURN_TTL_MS ||
      now < stored.createdAt ||
      !(stored.url === pathname || stored.url.startsWith(`${pathname}?`))
    ) {
      return null;
    }
    const params = new URLSearchParams(stored.url.split('?')[1] || '');
    if ((params.get('section') || 'index') !== 'activity') return null;
    return stored.url;
  } catch {
    return null;
  }
}

function findActivitySection() {
  return Array.from(document.querySelectorAll('section')).find((section) =>
    Array.from(section.querySelectorAll('h2')).some(
      (heading) => heading.textContent?.trim() === 'Activity',
    ),
  );
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function AdminActivityUserLinksBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const section = params.get('section') || 'index';
    const storedReturn = window.sessionStorage.getItem(RETURN_KEY);

    if (section === 'users' && !params.get('userUsageId')) {
      const target = validActivityReturnTarget(storedReturn, pathname);
      window.sessionStorage.removeItem(RETURN_KEY);
      if (target) router.replace(target);
      return;
    }

    if (section !== 'activity') return;

    const currentActivityUrl = search ? `${pathname}?${search}` : pathname;
    if (
      validActivityReturnTarget(storedReturn, pathname) === currentActivityUrl
    ) {
      window.sessionStorage.removeItem(RETURN_KEY);
    }

    let disposed = false;

    const enhance = () => {
      if (disposed) return;
      const activitySection = findActivitySection();
      const rows = activitySection?.querySelectorAll('tbody tr');
      if (!rows) return;

      rows.forEach((row) => {
        const cell = row.children.item(1) as HTMLTableCellElement | null;
        if (!cell || cell.dataset.dpActivityUserLink === 'true') return;
        const email = cell.textContent?.trim() || '';
        if (!isEmail(email)) return;

        cell.dataset.dpActivityUserLink = 'true';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = email;
        button.className =
          'text-left font-medium text-[color:var(--dp-blue)] hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dp-blue)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60';
        button.title = `View resource analytics for ${email}`;
        button.setAttribute('aria-label', `View resource analytics for ${email}`);

        button.addEventListener('click', async () => {
          if (button.disabled) return;
          button.disabled = true;
          try {
            const response = await fetch(
              `/api/admin/users/search?q=${encodeURIComponent(email)}`,
              { cache: 'no-store' },
            );
            const payload = await response.json().catch(() => ({ users: [] }));
            if (!response.ok) throw new Error('User lookup failed');
            const users = Array.isArray(payload.users)
              ? (payload.users as UserLookupResult[])
              : [];
            const user = users.find(
              (candidate) =>
                candidate.email?.trim().toLowerCase() === email.toLowerCase(),
            );
            if (!user?.id) throw new Error('User not found');

            const liveSearch = window.location.search.replace(/^\?/, '');
            const liveReturnUrl = `${pathname}${window.location.search}`;
            const stored: StoredReturn = {
              url: liveReturnUrl,
              createdAt: Date.now(),
            };
            window.sessionStorage.setItem(RETURN_KEY, JSON.stringify(stored));
            router.push(
              buildActivityUserModalUrl(pathname, liveSearch, user.id),
            );
          } catch (error) {
            console.error('Could not open Activity user analytics.', error);
            toast.error('Could not open this user’s resource analytics.');
            button.disabled = false;
          }
        });

        cell.replaceChildren(button);
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [pathname, router, search]);

  return null;
}
