'use client';

import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

function findUsersHeading() {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>('section h2')).find(
    (heading) => heading.textContent?.trim() === 'Users',
  );
}

export function AdminUserCountBadge() {
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'index';
  const [heading, setHeading] = useState<HTMLHeadingElement | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (section !== 'users') {
      setHeading(null);
      setCount(null);
      return;
    }

    let disposed = false;
    const locate = () => {
      if (disposed) return;
      const next = findUsersHeading();
      if (next) setHeading(next);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [section]);

  useEffect(() => {
    if (section !== 'users') return;
    let cancelled = false;

    fetch('/api/admin/users/search?q=', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.total !== 'number') {
          throw new Error('Could not load user total');
        }
        return payload.total as number;
      })
      .then((total) => {
        if (!cancelled) setCount(total);
      })
      .catch((error) => {
        console.error('Could not load Admin Users total.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [section]);

  if (section !== 'users' || !heading || count === null) return null;

  return createPortal(
    <span
      data-dp-admin-user-total="true"
      className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
      aria-label={`${count.toLocaleString()} total users`}
    >
      {count.toLocaleString()} total users
    </span>,
    heading,
  );
}
