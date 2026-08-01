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
    let disposed = false;

    const record = () => {
      if (disposed) return;
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
          keepalive: true,
        },
      ).catch(() => undefined);
    };

    record();
    const interval = window.setInterval(record, 400);
    window.addEventListener('popstate', record);
    window.addEventListener('dp-question-change', record);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('popstate', record);
      window.removeEventListener('dp-question-change', record);
    };
  }, [sessionId]);

  return null;
}
