'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const WARMED_AT_KEY = 'dp-library-root-warmed-at';
const WARM_TTL_MS = 45_000;
const START_DELAY_MS = 120;

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

function constrainedConnection() {
  const connection = (
    navigator as Navigator & { connection?: ConnectionInfo }
  ).connection;
  return Boolean(
    connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g',
  );
}

export function LibraryRouteWarmup() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname.startsWith('/library') || constrainedConnection()) return;

    const lastWarm = Number(sessionStorage.getItem(WARMED_AT_KEY) || 0);
    if (Date.now() - lastWarm < WARM_TTL_MS) {
      router.prefetch('/library');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      router.prefetch('/library');
      sessionStorage.setItem(WARMED_AT_KEY, String(Date.now()));
      void fetch('/api/library/warm', {
        method: 'POST',
        signal: controller.signal,
      }).catch(() => undefined);
    }, START_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pathname, router]);

  return null;
}
