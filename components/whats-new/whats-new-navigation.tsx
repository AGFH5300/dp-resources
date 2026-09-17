'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

type Props = {
  activeIndex: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
  onDone: () => void;
};

export function WhatsNewNavigation({
  activeIndex,
  count,
  onPrevious,
  onNext,
  onSelect,
  onDone,
}: Props) {
  const first = activeIndex === 0;
  const last = activeIndex === count - 1;

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={first}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--dp-theme-border)] bg-white text-[color:var(--dp-heading)] shadow-sm transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-30 dark:bg-slate-950 dark:hover:bg-slate-900"
        aria-label="Previous feature"
      >
        <ArrowLeft className="size-4" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        {count <= 7 ? (
          <div className="flex items-center justify-center gap-2" aria-label={`Feature ${activeIndex + 1} of ${count}`}>
            {Array.from({ length: count }, (_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSelect(index)}
                className={`h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                  index === activeIndex
                    ? 'w-6 bg-[color:var(--dp-navy)] dark:bg-blue-300'
                    : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600'
                }`}
                aria-label={`Show feature ${index + 1} of ${count}`}
                aria-current={index === activeIndex ? 'step' : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-64 items-center gap-3" aria-label={`Feature ${activeIndex + 1} of ${count}`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[color:var(--dp-navy)] transition-[width] duration-200 motion-reduce:transition-none dark:bg-blue-300"
                style={{ width: `${((activeIndex + 1) / count) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-[color:var(--dp-muted-text)]">
              {activeIndex + 1} / {count}
            </span>
          </div>
        )}
      </div>

      {last ? (
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--dp-navy)] px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)]"
        >
          Done
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--dp-navy)] text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)]"
          aria-label="Next feature"
        >
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
