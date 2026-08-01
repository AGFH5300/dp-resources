'use client';

import { ArrowRight, KeyRound, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PracticeCodeEntry } from '@/components/question-bank/practice-code-entry';

export function QuestionBankJoinModal() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('join') === '1');

  useEffect(() => {
    if (searchParams.get('join') === '1') setOpen(true);
  }, [searchParams]);

  const close = useCallback(() => {
    setOpen(false);
    if (searchParams.get('join') !== '1') return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('join');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:group-hover:bg-blue-900/55">
            <KeyRound className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="text-lg text-[color:var(--dp-navy)]">
              Join with a code
            </strong>
            <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
              Load a permanent shared configuration, then use exact questions or
              customize it for your own progress.
            </span>
          </span>
          <ArrowRight className="mt-1 size-5 text-blue-500 transition group-hover:translate-x-1 group-hover:text-blue-800" />
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-practice-title"
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <KeyRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="join-practice-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Join with a practice-set code
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Enter the code shared with you. You can use the exact questions,
                  generate a fresh set, or customize the configuration.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Close join dialog"
              >
                <X className="size-5" />
              </button>
            </div>
            <PracticeCodeEntry />
          </section>
        </div>
      ) : null}
    </>
  );
}
