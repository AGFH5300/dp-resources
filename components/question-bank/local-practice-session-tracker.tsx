'use client';

import { useEffect, useMemo, useRef } from 'react';

import { updateLocalPracticeSessionPosition } from '@/lib/question-bank/local-practice-session-storage';

export function LocalPracticeSessionTracker({
  sessionId,
  userId,
  positions,
}: {
  sessionId: string;
  userId: string;
  positions: Array<{ variantId: string; position: number }>;
}) {
  const positionByVariant = useMemo(
    () => new Map(positions.map((item) => [item.variantId, item.position])),
    [positions],
  );
  const lastVariant = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const record = () => {
      if (disposed) return;
      const variantId = new URL(window.location.href).searchParams.get('question');
      if (!variantId || lastVariant.current === variantId) return;
      const position = positionByVariant.get(variantId);
      if (position === undefined) return;
      lastVariant.current = variantId;
      void updateLocalPracticeSessionPosition({
        sessionId,
        userId,
        position,
      }).catch(() => undefined);
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
  }, [positionByVariant, sessionId, userId]);

  return null;
}
