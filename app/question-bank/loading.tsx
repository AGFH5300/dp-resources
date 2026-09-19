import Link from 'next/link';
import { ArrowRight, BookOpenCheck, KeyRound, Layers3, Search } from 'lucide-react';

import { Nav } from '@/components/nav';

export default function QuestionBankLoading() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <section className="dp-qb-hero">
          <div>
            <h1>Question Bank</h1>
            <p>
              Follow one course, build a custom session, or load a practice set
              shared by another student.
            </p>
          </div>
          <div className="dp-qb-search-box" aria-hidden="true">
            <Search className="size-5" />
            <span className="flex-1 text-slate-400">
              Search references, questions, topics…
            </span>
            <span className="font-medium text-slate-400">Search</span>
          </div>
        </section>

        <section
          className="mt-6 grid gap-4 md:grid-cols-3"
          aria-label="Practice choices"
        >
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm dark:border-emerald-900/70 dark:from-emerald-950/45 dark:via-slate-900 dark:to-teal-950/30">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <BookOpenCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="text-lg text-[color:var(--dp-navy)] dark:text-slate-50">
                  Practise a course
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Choose one IB course and work through its syllabus, topics and
                  existing filters.
                </span>
              </span>
              <ArrowRight className="mt-1 size-5 text-emerald-600 dark:text-emerald-300" />
            </div>
          </div>

          <Link
            href="/question-bank/build"
            prefetch={false}
            className="group rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md dark:border-indigo-900/70 dark:from-indigo-950/45 dark:via-slate-900 dark:to-violet-950/30"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
                <Layers3 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="text-lg text-[color:var(--dp-navy)] dark:text-slate-50">
                  Build a practice set
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Combine topics across subjects and choose different courses and
                  question quotas for every selection.
                </span>
              </span>
              <ArrowRight className="mt-1 size-5 text-indigo-600 dark:text-indigo-300" />
            </div>
          </Link>

          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm dark:border-amber-900/70 dark:from-amber-950/35 dark:via-slate-900 dark:to-orange-950/25">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <KeyRound className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="text-lg text-[color:var(--dp-navy)] dark:text-slate-50">
                  Join with a code
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Load a shared practice set, then use the same questions or customize it for your own progress.
                </span>
              </span>
              <ArrowRight className="mt-1 size-5 text-amber-600 dark:text-amber-300" />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((item) => (
              <span
                key={item}
                className="h-8 w-32 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
