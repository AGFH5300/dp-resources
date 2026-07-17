'use client';

import { useEffect, useState } from 'react';
import {
  SUSPENDED_USER_ID_STORAGE_KEY,
  SUSPENSION_REASON_STORAGE_KEY,
  SUSPENSION_REASON_UPDATED_EVENT,
} from '@/components/suspension-storage';

export function SuspensionReasonFallback({
  initialReason,
}: {
  initialReason: string | null;
}) {
  const [reason, setReason] = useState(initialReason);

  useEffect(() => {
    if (!initialReason) {
      const stored = window.sessionStorage.getItem(
        SUSPENSION_REASON_STORAGE_KEY,
      );
      if (stored) setReason(stored);
    }

    function onReasonUpdated(event: Event) {
      const reason =
        (event as CustomEvent<{ reason: string | null }>).detail?.reason ??
        null;
      setReason(reason);
    }

    window.addEventListener(SUSPENSION_REASON_UPDATED_EVENT, onReasonUpdated);
    return () =>
      window.removeEventListener(
        SUSPENSION_REASON_UPDATED_EVENT,
        onReasonUpdated,
      );
  }, [initialReason]);

  if (!reason) return null;

  return (
    <section
      className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
      aria-label="Reason for suspension"
    >
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">
        Reason for suspension
      </h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reason}</p>
    </section>
  );
}

export function ClearSuspensionReasonButton({
  className,
}: {
  className: string;
}) {
  return (
    <button
      className={className}
      type="submit"
      onClick={() => {
        window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY);
        window.sessionStorage.removeItem(SUSPENDED_USER_ID_STORAGE_KEY);
      }}
    >
      Sign out
    </button>
  );
}
