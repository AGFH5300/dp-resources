export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { KeyRound, X } from 'lucide-react';

import { Nav } from '@/components/nav';
import { PracticeCodeEntry } from '@/components/question-bank/practice-code-entry';
import { requireMember } from '@/lib/auth';

export default async function JoinPracticeSetPage() {
  const { membership } = await requireMember();

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="min-h-[calc(100dvh-5rem)] bg-[color:var(--dp-page)]" />
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-practice-title"
          className="relative w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
        >
          <Link
            href="/question-bank"
            aria-label="Close code dialog"
            className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="size-5" />
          </Link>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <KeyRound className="size-6" />
          </div>
          <h1
            id="join-practice-title"
            className="mt-5 pr-10 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
          >
            Join with a practice-set code
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Enter the code shared with you. You can then use the exact questions when
            available, choose questions based on your progress, or customize every
            part of the configuration.
          </p>
          <PracticeCodeEntry />
        </section>
      </div>
    </>
  );
}
