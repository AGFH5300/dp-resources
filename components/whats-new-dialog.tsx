'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SiteConfirmDialog } from '@/components/ui/site-confirm-dialog';
import { WHATS_NEW_RELEASE } from '@/lib/whats-new';

const STORAGE_KEY = `dp-whats-new:${WHATS_NEW_RELEASE.id}`;

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('dp:open-whats-new', show);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== 'seen') setOpen(true);
    } catch {
      setOpen(true);
    }
    return () => window.removeEventListener('dp:open-whats-new', show);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'seen');
    } catch {
      // The modal can still be dismissed when browser storage is unavailable.
    }
    setOpen(false);
  };

  return (
    <SiteConfirmDialog
      open={open}
      onClose={dismiss}
      closeLabel="Close What’s new"
      title="What’s new"
      description={WHATS_NEW_RELEASE.dateLabel}
    >
      <ul
        aria-label="Release highlights"
        className="max-h-[min(52vh,28rem)] space-y-4 overflow-y-auto overscroll-contain pr-2"
      >
        {WHATS_NEW_RELEASE.items.map((item) => (
          <li key={item.title} className="flex gap-3">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-emerald-600"
              aria-hidden
            />
            <span>
              <strong className="block text-sm text-[color:var(--dp-heading)]">
                {item.title}
              </strong>
              <span className="mt-1 block text-sm leading-5 text-[color:var(--dp-muted-text)]">
                {item.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--dp-theme-border)] pt-4">
        <Link
          href="/changelog"
          onClick={dismiss}
          className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
        >
          View full changelog
        </Link>
        <button
          type="button"
          data-autofocus
          onClick={dismiss}
          className="rounded-md bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </SiteConfirmDialog>
  );
}
