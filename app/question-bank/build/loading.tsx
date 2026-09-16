import { Layers3, SlidersHorizontal } from 'lucide-react';

import { Nav } from '@/components/nav';

const SOURCES = ['Revision Village', 'Revision Town', 'PESTLE', 'Exam-Mate'];

export default function LoadingPracticeBuilder() {
  return (
    <>
      <Nav />
      <main
        className="mx-auto max-w-[1600px] px-4 py-6 pb-24 sm:px-6 lg:px-8"
        aria-busy="true"
      >
        <div className="h-5 w-32 rounded bg-slate-100 dark:bg-slate-800" />

        <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Layers3 className="size-5" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                Practice Builder
              </span>
            </div>
            <div className="mt-4 h-10 max-w-2xl rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-3 h-5 max-w-3xl rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          <section className="min-h-[430px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
              1 · Configure selections
            </p>
            <div className="mt-3 h-6 w-52 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-4 h-24 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
            <div className="mt-4 h-48 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800" />
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <SlidersHorizontal className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                      2 · Session settings
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                      Mix and filters
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Difficulty
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                    {['Easy', 'Medium', 'Hard', 'Unrated'].map((label) => (
                      <label key={label} className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked readOnly />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Sources
                  </legend>
                  <div className="mt-2 space-y-2">
                    {SOURCES.map((source) => (
                      <label key={source} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input type="checkbox" />
                        <span className="min-w-0 flex-1 truncate">{source}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Choose one or more sources. Leave all unchecked to use every source.
                  </p>
                </fieldset>
              </div>
            </section>
          </aside>
        </div>
        <span className="sr-only">Loading Practice Builder</span>
      </main>
    </>
  );
}
