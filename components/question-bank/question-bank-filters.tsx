'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronDown, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AppSelect } from '@/components/ui/app-select';
import type { QuestionFilters } from '@/lib/question-bank/types';

const ANY = '__any__';

type Topic = {
  id: string;
  slug?: string;
  name: string;
  subtopics?: Array<{ id: string; name: string }>;
};

type FilterOptions = {
  difficulties: string[];
  sections: string[];
  calculatorValues: boolean[];
};

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function QuestionBankFilters({
  topics,
  papers,
  filters,
  filterOptions,
  resetHref,
}: {
  topics: Topic[];
  papers: Array<{ id: string; reference: string }>;
  filters: QuestionFilters;
  filterOptions: FilterOptions;
  resetHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [topicId, setTopicId] = useState(filters.topicId || ANY);
  const [subtopicId, setSubtopicId] = useState(filters.subtopicId || ANY);
  const [moreOpen, setMoreOpen] = useState(
    Boolean(
      filters.difficulty ||
        filters.section ||
        filters.calculator !== null ||
        filters.status ||
        filters.saved,
    ),
  );
  const selectedTopic = topics.find((topic) => topic.id === topicId);
  const uncategorized = topics.find(
    (topic) =>
      topic.slug === 'uncategorized' ||
      topic.name.trim().toLocaleLowerCase() === 'uncategorized',
  );
  const showDifficulty = filterOptions.difficulties.length > 1;
  const showSection = filterOptions.sections.length > 1;
  const showCalculator = filterOptions.calculatorValues.length > 1;
  const showPaper = papers.length > 1;
  const activeExtraCount = [
    Boolean(filters.difficulty),
    Boolean(filters.section),
    filters.calculator !== null,
    Boolean(filters.status),
    Boolean(filters.saved),
  ].filter(Boolean).length;

  useEffect(() => {
    setSearch(filters.q);
    setTopicId(filters.topicId || ANY);
    setSubtopicId(filters.subtopicId || ANY);
  }, [filters.q, filters.subtopicId, filters.topicId]);

  function updateParams(
    patch: Record<string, string | null>,
    options: { resetSubtopic?: boolean } = {},
  ) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('page');
    next.delete('question');
    if (options.resetSubtopic) next.delete('subtopic');
    Object.entries(patch).forEach(([key, value]) => {
      if (!value || value === ANY) next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (href === `${pathname}${searchParams.toString() ? `?${searchParams}` : ''}`)
      return;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (search.trim() !== filters.q) {
        updateParams({ q: search.trim() || null });
      }
    }, 350);
    return () => window.clearTimeout(timeout);
    // filters.q is the server-confirmed value; updateParams intentionally uses
    // the current URL snapshot instead of becoming an effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters.q]);

  const difficultyOptions = useMemo(
    () => [
      { value: ANY, label: 'Any difficulty' },
      ...filterOptions.difficulties.map((value) => ({
        value,
        label: label(value),
      })),
    ],
    [filterOptions.difficulties],
  );

  function changeTopic(value: string) {
    setTopicId(value);
    setSubtopicId(ANY);
    updateParams(
      { topic: value === ANY ? null : value, subtopic: null },
      { resetSubtopic: true },
    );
  }

  return (
    <section className="dp-qb-filters" aria-label="Question filters">
      <div className="dp-qb-filter-bar">
        <label className="dp-qb-filter-search">
          <span className="sr-only">Search this course</span>
          <span className="dp-qb-filter-input">
            <Search className="size-4" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={160}
              placeholder="Search reference or question text"
            />
          </span>
        </label>

        <label>
          <span className="sr-only">Main topic</span>
          <AppSelect
            value={topicId}
            onValueChange={changeTopic}
            placeholder="All topics"
            searchable
            searchPlaceholder="Search topics"
            options={[
              { value: ANY, label: 'All topics' },
              ...topics.map((topic) => ({ value: topic.id, label: topic.name })),
            ]}
          />
        </label>

        <label>
          <span className="sr-only">Subtopic</span>
          <AppSelect
            value={subtopicId}
            onValueChange={(value) => {
              setSubtopicId(value);
              updateParams({ subtopic: value === ANY ? null : value });
            }}
            disabled={!selectedTopic}
            placeholder={selectedTopic ? 'All subtopics' : 'Choose a topic'}
            searchable
            searchPlaceholder="Search subtopics"
            options={[
              { value: ANY, label: 'All subtopics' },
              ...(selectedTopic?.subtopics || []).map((subtopic) => ({
                value: subtopic.id,
                label: subtopic.name,
              })),
            ]}
          />
        </label>

        {showPaper ? (
          <label>
            <span className="sr-only">Paper</span>
            <AppSelect
              value={filters.paperId || ANY}
              onValueChange={(value) =>
                updateParams({ paper: value === ANY ? null : value })
              }
              placeholder="Any paper"
              searchable
              searchPlaceholder="Search papers"
              options={[
                { value: ANY, label: 'Any paper' },
                ...papers.map((paper) => ({
                  value: paper.id,
                  label: paper.reference,
                })),
              ]}
            />
          </label>
        ) : null}

        <button
          type="button"
          className="dp-qb-more-filters"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <SlidersHorizontal className="size-4" />
          More filters
          {activeExtraCount ? (
            <span aria-label={`${activeExtraCount} active secondary filters`}>
              {activeExtraCount}
            </span>
          ) : null}
          <ChevronDown className={`size-4 ${moreOpen ? 'rotate-180' : ''}`} />
        </button>

        {isPending ? (
          <span className="dp-qb-filter-pending" role="status">
            <Loader2 className="size-4 animate-spin" />
            Updating
          </span>
        ) : null}
      </div>

      {moreOpen ? (
        <div className="dp-qb-filter-more">
          {showDifficulty ? (
            <label>
              <span>Difficulty</span>
              <AppSelect
                value={filters.difficulty || ANY}
                onValueChange={(value) =>
                  updateParams({ difficulty: value === ANY ? null : value })
                }
                options={difficultyOptions}
              />
            </label>
          ) : null}

          {showSection ? (
            <label>
              <span>Section</span>
              <AppSelect
                value={filters.section || ANY}
                onValueChange={(value) =>
                  updateParams({ section: value === ANY ? null : value })
                }
                searchable
                searchPlaceholder="Search sections"
                options={[
                  { value: ANY, label: 'Any section' },
                  ...filterOptions.sections.map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
            </label>
          ) : null}

          {showCalculator ? (
            <label>
              <span>Calculator</span>
              <AppSelect
                value={
                  filters.calculator === null
                    ? ANY
                    : String(filters.calculator)
                }
                onValueChange={(value) =>
                  updateParams({
                    calculator: value === ANY ? null : value,
                  })
                }
                options={[
                  { value: ANY, label: 'Either' },
                  ...(filterOptions.calculatorValues.includes(true)
                    ? [{ value: 'true', label: 'Allowed' }]
                    : []),
                  ...(filterOptions.calculatorValues.includes(false)
                    ? [{ value: 'false', label: 'Not allowed' }]
                    : []),
                ]}
              />
            </label>
          ) : null}

          <label>
            <span>Progress</span>
            <AppSelect
              value={filters.status || ANY}
              onValueChange={(value) =>
                updateParams({ status: value === ANY ? null : value })
              }
              options={[
                { value: ANY, label: 'Any progress' },
                { value: 'not_started', label: 'Not started' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </label>

          <label>
            <span>Saved</span>
            <AppSelect
              value={filters.saved ? 'saved' : ANY}
              onValueChange={(value) => {
                updateParams({
                  mine: value === 'saved' ? 'saved' : null,
                  saved: null,
                  revisit: null,
                });
              }}
              options={[
                { value: ANY, label: 'All questions' },
                { value: 'saved', label: 'Saved questions' },
              ]}
            />
          </label>

          <div className="dp-qb-filter-actions">
            {uncategorized ? (
              <button
                type="button"
                onClick={() => changeTopic(uncategorized.id)}
              >
                View Uncategorized
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                startTransition(() =>
                  router.replace(resetHref, { scroll: false }),
                )
              }
            >
              Reset filters
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
