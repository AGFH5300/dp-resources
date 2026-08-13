import type { ResourceAttribution } from '@/lib/types';
import type { QuestionPublicSource } from '@/lib/question-bank/types';
import React from 'react';

const SOURCE_TOOLTIP =
  'Source identifies the collection or provider through which this resource was added to DP Resources and may not identify the original copyright owner.';

function labelForSources(labels: string[]) {
  if (labels.length <= 2) return labels.join(' · ');
  return `${labels.slice(0, 2).join(' · ')} · +${labels.length - 2}`;
}

function publicQuestionSources(sources: QuestionPublicSource[]) {
  return sources.map((source) =>
    source.reviewStatus === 'under_review'
      ? {
          ...source,
          slug: 'unknown',
          displayName: 'Source attribution under review',
          shortLabel: 'Under review',
          attributionLabel: 'Source',
        }
      : source,
  );
}

export function QuestionSourceBadges({
  sources = [],
  className = '',
}: {
  sources?: QuestionPublicSource[];
  className?: string;
}) {
  const safeSources = publicQuestionSources(sources);
  const variantSources = safeSources.filter((source) => source.isVariantSource);
  const display = variantSources.length ? variantSources : safeSources;
  const deduped = [...new Map(display.map((source) => [source.slug, source])).values()];
  if (!deduped.length) return null;
  const labels = deduped.map((source) => source.shortLabel);
  const text = `${deduped.length === 1 ? 'Source' : 'Sources'}: ${labelForSources(labels)}`;
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${className}`}
      aria-label={text}
      title={text}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

export function QuestionSourceInformation({
  sources = [],
}: {
  sources?: QuestionPublicSource[];
}) {
  const safeSources = publicQuestionSources(sources);
  const indexed = [
    ...new Map(
      safeSources
        .filter((source) => source.isVariantSource)
        .map((source) => [source.slug, source]),
    ).values(),
  ];
  const alsoFound = [
    ...new Map(
      safeSources
        .filter(
          (source) =>
            !source.isVariantSource && !indexed.some((item) => item.slug === source.slug),
        )
        .map((source) => [source.slug, source]),
    ).values(),
  ];
  if (!indexed.length && !alsoFound.length) return null;
  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
      <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
        Source information
      </summary>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        {indexed.length ? (
          <p>
            <span className="font-medium">Indexed collections:</span>{' '}
            {indexed.map((source) => source.displayName).join(' · ')}
          </p>
        ) : null}
        {alsoFound.length ? (
          <p>
            <span className="font-medium">Also found in:</span>{' '}
            {alsoFound.map((source) => source.displayName).join(' · ')}
          </p>
        ) : null}
        {safeSources.some((source) => source.reviewStatus === 'under_review') ? (
          <p>Source attribution is under review; no unverified provider is shown.</p>
        ) : null}
        <p className="text-xs text-slate-500">
          An indexed collection is where DP Resources obtained or indexed the
          item. It does not necessarily identify the original author or examination board.
        </p>
      </div>
    </details>
  );
}

export function ResourceAttributionBadges({
  attribution,
}: {
  attribution?: ResourceAttribution;
}) {
  if (!attribution) return null;
  const applicableSources = attribution.sources.filter(
    (source) =>
      source.reviewStatus === 'reviewed' &&
      source.slug !== 'unknown' &&
      !/under review/i.test(source.displayName),
  );
  const primary =
    applicableSources.find((source) => source.isPrimary) ?? applicableSources[0];
  const type = attribution.resourceType;
  if (!primary && !type) return null;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 text-xs text-slate-500">
      {primary ? (
        <span
          className="max-w-48 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900"
          title={SOURCE_TOOLTIP}
          aria-label={`Source: ${primary.displayName}. ${SOURCE_TOOLTIP}`}
        >
          {primary.shortLabel}
        </span>
      ) : null}
      {type ? (
        <span
          className="max-w-40 truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-950"
          aria-label={`Resource type: ${type.displayName}`}
        >
          {type.displayName}
        </span>
      ) : null}
    </span>
  );
}
