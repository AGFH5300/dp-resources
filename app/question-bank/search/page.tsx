export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { questionPreview } from '@/lib/question-bank/content-normalization';
import { marksLabel, taxonomyLabel } from '@/lib/question-bank/presentation';
import { searchQuestionBank } from '@/lib/question-bank/queries';
import { resolveQuestionSearchAlias } from '@/lib/question-bank/search-aliases';
import { createClient } from '@/lib/supabase-server';
import { QuestionSourceBadges } from '@/components/content-source-badge';
import { SourceMultiFilter } from '@/components/question-bank/source-multi-filter';

const QUESTION_SEARCH_MAX_PAGE = 1000;

export default async function QuestionBankSearch({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const params = await searchParams;
  const query = String(params.q || '').trim().slice(0, 160);
  const searchAlias = resolveQuestionSearchAlias(query);
  const rawPage = Number(params.page || 1);
  const page = Number.isFinite(rawPage)
    ? Math.min(QUESTION_SEARCH_MAX_PAGE, Math.max(1, Math.floor(rawPage)))
    : 1;
  const selectedSources = String(params.sources || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, values) =>
      /^[a-z0-9_]+$/.test(value) && values.indexOf(value) === index,
    )
    .slice(0, 10);
  const client = await createClient();
  const sourceOptionsPromise = client.rpc('dp_content_source_options');

  let results: any[] = [];
  let searchUnavailable = false;
  if (query.length >= 2) {
    try {
      results = await searchQuestionBank(
        searchAlias.query,
        page,
        selectedSources,
      );
    } catch (error) {
      searchUnavailable = true;
      console.error('[question-bank-search] search failed', {
        message: error instanceof Error ? error.message : String(error),
        queryLength: query.length,
        page,
      });
    }
  }

  const { data: sourceOptions = [] } = await sourceOptionsPromise;
  const total = Number(results[0]?.total_count || 0);
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link href="/question-bank" className="text-sm text-blue-700 hover:underline">
          ← Question Bank
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--dp-navy)]">
          Search questions
        </h1>
        <form className="dp-qb-search-box mt-4" action="/question-bank/search">
          <Search className="size-5" />
          <input
            name="q"
            defaultValue={query}
            minLength={2}
            maxLength={160}
            placeholder="Reference, question, subject, course, topic, or paper"
            aria-label="Search questions"
          />
          <button type="submit">Search</button>
        </form>
        <SourceMultiFilter
          selected={selectedSources}
          options={(sourceOptions as any[])
            .filter((source) => Number(source.question_variant_count || 0) > 0)
            .map((source) => ({
              slug: source.slug,
              label: source.short_label,
              count: Number(source.question_variant_count || 0),
            }))}
        />
        <p className="mt-3 text-sm text-slate-600">
          {query.length < 2
            ? 'Enter at least two characters.'
            : searchUnavailable
              ? 'Search is temporarily unavailable. Please try again.'
              : `${total.toLocaleString()} result${total === 1 ? '' : 's'} for “${query}”`}
        </p>
        {searchAlias.label && !searchUnavailable ? (
          <p className="mt-1 text-xs text-slate-500">
            Recognized as {searchAlias.label}.
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {results.map((row) => (
            <Link
              key={row.variant_id}
              href={`/question-bank/${row.subject_slug}/${row.course_slug}?question=${row.variant_id}`}
              className="dp-qb-question-row"
              data-difficulty={row.difficulty_label || 'unrated'}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{row.reference}</strong>
                <span
                  className={`dp-qb-difficulty dp-qb-difficulty-${
                    row.difficulty_label || 'unrated'
                  }`}
                >
                  {row.difficulty_label || 'Unrated'}
                </span>
                <span className="dp-qb-chip dp-qb-mark-chip">
                  {marksLabel(row.maximum_mark)}
                </span>
                <QuestionSourceBadges sources={row.sources} />
              </div>
              <p>
                {questionPreview(row.content_preview) ||
                  'No question text in the source.'}
              </p>
              <small>
                {row.subject_name} · {row.course_name} ·{' '}
                {taxonomyLabel(row.topic_name)}
                {row.paper_reference ? ` · ${row.paper_reference}` : ''}
              </small>
            </Link>
          ))}
          {searchUnavailable ? (
            <div className="dp-qb-empty" role="alert">
              Question search could not be completed. Please try again.
            </div>
          ) : query.length >= 2 && !results.length ? (
            <div className="dp-qb-empty">No matching questions found.</div>
          ) : null}
        </div>
      </main>
    </>
  );
}
