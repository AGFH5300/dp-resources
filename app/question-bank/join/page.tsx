export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';

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
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link
          href="/question-bank"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
        >
          <ArrowLeft className="size-4" /> Question Bank
        </Link>

        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <KeyRound className="size-6" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Join with a practice-set code
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Load a configuration shared by another student. You can use the exact
            questions when available, choose questions based on your own progress, or
            edit every subject, topic, course, filter and quantity before starting.
          </p>
          <PracticeCodeEntry />
        </section>
      </main>
    </>
  );
}
