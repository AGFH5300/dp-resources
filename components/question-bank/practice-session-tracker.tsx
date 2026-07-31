'use client';

import { useEffect, useRef } from 'react';

export function PracticeSessionTracker({
  sessionId,
  variantIds,
}: {
  sessionId: string;
  variantIds: string[];
}) {
  const allowed = useRef(new Set(variantIds));
  const lastVariant = useRef<string | null>(null);

  useEffect(() => {
    allowed.current = new Set(variantIds);
  }, [variantIds]);

  useEffect(() => {
    const originalReplaceState = window.history.replaceState;
    const notify = () => window.dispatchEvent(new Event('dp-location-change'));
    const patchedReplaceState: History['replaceState'] = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      originalReplaceState.call(window.history, data, unused, url);
      notify();
    };
    window.history.replaceState = patchedReplaceState;

    const record = () => {
      const variantId = new URL(window.location.href).searchParams.get('question');
      if (
        !variantId ||
        !allowed.current.has(variantId) ||
        lastVariant.current === variantId
      )
        return;
      lastVariant.current = variantId;
      void fetch(
        `/api/question-bank/practice-builder/sessions/${sessionId}/state`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId, status: 'viewed' }),
        },
      ).catch(() => undefined);
    };

    window.addEventListener('dp-location-change', record);
    window.addEventListener('popstate', record);
    record();
    return () => {
      window.removeEventListener('dp-location-change', record);
      window.removeEventListener('popstate', record);
      if (window.history.replaceState === patchedReplaceState)
        window.history.replaceState = originalReplaceState;
    };
  }, [sessionId]);

  return null;
}
