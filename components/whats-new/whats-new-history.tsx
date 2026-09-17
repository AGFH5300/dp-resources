'use client';

import { ArrowLeft, CalendarDays, ChevronRight } from 'lucide-react';

import type { WhatsNewRelease } from '@/lib/whats-new';

type Props = {
  releases: readonly WhatsNewRelease[];
  selectedReleaseId: string;
  viewedReleaseIds: readonly string[];
  onBack: () => void;
  onSelect: (release: WhatsNewRelease) => void;
};

export function WhatsNewHistory({
  releases,
  selectedReleaseId,
  viewedReleaseIds,
  onBack,
  onSelect,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-[color:var(--dp-theme-border)] px-5 py-4 sm:px-7">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[color:var(--dp-muted-text)] transition hover:bg-slate-100 hover:text-[color:var(--dp-heading)] dark:hover:bg-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to update
        </button>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--dp-heading)]">
          Release history
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--dp-muted-text)]">
          Revisit the visual highlights from meaningful DP Resources releases. The full changelog still contains smaller fixes and maintenance updates.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {releases.map((release) => {
            const selected = release.id === selectedReleaseId;
            const viewed = viewedReleaseIds.includes(release.id);
            return (
              <button
                key={release.id}
                type="button"
                onClick={() => onSelect(release)}
                className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)] sm:p-5 ${
                  selected
                    ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20'
                    : 'border-[color:var(--dp-theme-border)] bg-white hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 dark:bg-slate-950'
                }`}
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <CalendarDays className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[color:var(--dp-heading)]">
                      {release.dateLabel}
                    </span>
                    {viewed ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        Viewed
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[color:var(--dp-muted-text)]">
                    {release.summary}
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {release.features.length} {release.features.length === 1 ? 'highlight' : 'highlights'}
                  </p>
                </div>
                <ChevronRight className="mt-3 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
