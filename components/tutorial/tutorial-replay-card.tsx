'use client';

import { Map, Play } from 'lucide-react';

import {
  CORE_TUTORIAL_KEY,
  CORE_TUTORIAL_VERSION,
  TUTORIAL_START_EVENT,
} from '@/lib/tutorials';

export function TutorialReplayCard() {
  const replay = () => {
    window.dispatchEvent(
      new CustomEvent(TUTORIAL_START_EVENT, {
        detail: {
          key: CORE_TUTORIAL_KEY,
          version: CORE_TUTORIAL_VERSION,
          stepIndex: 0,
          replay: true,
        },
      }),
    );
  };

  return (
    <section
      data-tutorial-target="tutorial-replay"
      aria-labelledby="interactive-tutorial-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Map className="size-5" aria-hidden />
          </span>
          <div>
            <h2
              id="interactive-tutorial-title"
              className="font-semibold text-[color:var(--dp-heading)]"
            >
              Interactive tutorial
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--dp-muted-text)]">
              Replay the guided tour of the Library, Question Bank, search,
              Practice Builder, source filters, Saved, Recent, and your account
              settings.
            </p>
          </div>
        </div>
        <button
          type="button"
          data-tutorial-target="tutorial-replay-button"
          onClick={replay}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Play className="size-4" aria-hidden />
          Replay tutorial
        </button>
      </div>
    </section>
  );
}
