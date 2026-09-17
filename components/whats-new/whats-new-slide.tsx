'use client';

import { ArrowUpRight } from 'lucide-react';

import { WhatsNewMedia } from '@/components/whats-new/whats-new-media';
import type { WhatsNewFeature } from '@/lib/whats-new';

type Props = {
  feature: WhatsNewFeature;
  active: boolean;
  index: number;
  count: number;
  onTryIt: (href: string) => void;
};

export function WhatsNewSlide({
  feature,
  active,
  index,
  count,
  onTryIt,
}: Props) {
  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${feature.title}`}
      className="grid min-h-0 flex-none gap-0 lg:flex-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.72fr)] lg:overflow-hidden"
    >
      <div className="min-h-0 bg-[linear-gradient(145deg,rgba(239,246,255,0.94),rgba(248,250,252,0.92)_46%,rgba(241,245,249,0.94))] p-3 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.97))] sm:p-5 lg:p-6">
        <div className="h-full min-h-[17rem] overflow-hidden rounded-[1.35rem] border border-white/75 bg-white/65 shadow-[0_18px_55px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-slate-950/70 dark:ring-white/[0.04] sm:min-h-[22rem] lg:min-h-0">
          <WhatsNewMedia media={feature.media} active={active} />
        </div>
      </div>

      <div className="flex min-h-0 flex-col border-t border-[color:var(--dp-theme-border)] bg-[color:var(--dp-warm-surface)] px-5 py-5 dark:bg-slate-950 sm:px-7 sm:py-6 lg:border-l lg:border-t-0 lg:px-8 lg:py-8">
        <div className="my-auto">
          {feature.badge ? (
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-blue-700 dark:border-blue-900 dark:bg-blue-950/35 dark:text-blue-200">
              {feature.badge}
            </span>
          ) : null}

          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-[color:var(--dp-heading)] sm:text-3xl lg:text-[2rem] lg:leading-[1.08]">
            {feature.title}
          </h2>
          <p className="mt-4 text-sm leading-6 text-[color:var(--dp-muted-text)] sm:text-[15px] sm:leading-7">
            {feature.description}
          </p>

          {feature.cta ? (
            <button
              type="button"
              onClick={() => onTryIt(feature.cta!.href)}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--dp-navy)] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)] motion-reduce:hover:translate-y-0"
            >
              {feature.cta.label || 'Try it'}
              <ArrowUpRight className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <p className="mt-6 text-xs tabular-nums text-slate-400 dark:text-slate-500">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </p>
      </div>
    </article>
  );
}
