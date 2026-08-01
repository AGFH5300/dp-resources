'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  CheckSquare2,
  ChevronDown,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PracticeShareDialog } from '@/components/question-bank/practice-share-dialog';
import { AppSelect } from '@/components/ui/app-select';
import type { PracticeOrderingMode } from '@/lib/question-bank/practice-allocation';
import type {
  PracticeConfiguration,
  PracticeFilters,
} from '@/lib/question-bank/practice-configuration';
import type {
  PracticeMaximumPreview,
  PracticePreview,
  PracticePreviewBlock,
} from '@/lib/question-bank/practice-engine';

import styles from './practice-set-builder-v2.module.css';

type CatalogCourse = {
  id: string;
  slug: string;
  name: string;
  level: string | null;
  syllabusLabel: string | null;
  questionCount: number;
};

type CatalogConcept = {
  id: string;
  slug: string;
  name: string;
  description: string;
  aliases: string[];
  courses: CatalogCourse[];
};

type CatalogSubject = {
  id: string;
  slug: string;
  name: string;
  groups: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    concepts: CatalogConcept[];
  }>;
};

type Catalog = { subjects: CatalogSubject[] };

type BuilderBlock = {
  key: string;
  subjectId: string;
  subjectName: string;
  groupName: string;
  concept: CatalogConcept;
  courseIds: string[];
  requestedCount: number;
};

export type SharedBuilderSource = {
  code: string;
  name: string;
  creatorLabel: string;
};

const DIFFICULTIES = ['easy', 'medium', 'hard', 'unrated'] as const;
const STATUSES = ['not_started', 'in_progress', 'completed'] as const;

const ORDER_OPTIONS = [
  { value: 'interleaved', label: 'Interleave selected topics' },
  { value: 'mixed', label: 'Mix randomly' },
  { value: 'grouped', label: 'Group by topic' },
  { value: 'easier_to_harder', label: 'Easier to harder' },
  { value: 'source_order', label: 'Source order' },
];

const SAVED_OPTIONS = [
  { value: 'any', label: 'Any saved status' },
  { value: 'saved', label: 'Saved questions only' },
  { value: 'not_saved', label: 'Not-saved questions only' },
];

const CALCULATOR_OPTIONS = [
  { value: 'any', label: 'Any calculator status' },
  { value: 'allowed', label: 'Calculator allowed' },
  { value: 'not_allowed', label: 'No calculator allowed' },
];

function human(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isLegacy(course: CatalogCourse) {
  return /legacy|final assessment 20(?:1\d|2[0-4])|2009|2019/i.test(
    String(course.syllabusLabel || ''),
  );
}

function initialCourses(concept: CatalogConcept) {
  const current = concept.courses.filter((course) => !isLegacy(course));
  return (current.length ? current : concept.courses.slice(0, 1)).map(
    (course) => course.id,
  );
}

function selectedCourseUpperBound(block: BuilderBlock) {
  return block.concept.courses
    .filter((course) => block.courseIds.includes(course.id))
    .reduce((total, course) => total + course.questionCount, 0);
}

function maximumForBlock(
  block: BuilderBlock,
  previewBlock?: PracticePreviewBlock,
) {
  return Math.max(
    0,
    previewBlock?.candidateCount ?? selectedCourseUpperBound(block),
  );
}

function catalogConceptIndex(catalog: Catalog) {
  const index = new Map<
    string,
    {
      subjectId: string;
      subjectName: string;
      groupName: string;
      concept: CatalogConcept;
    }
  >();
  for (const subject of catalog.subjects) {
    for (const group of subject.groups) {
      for (const concept of group.concepts) {
        index.set(concept.id, {
          subjectId: subject.id,
          subjectName: subject.name,
          groupName: group.name,
          concept,
        });
      }
    }
  }
  return index;
}

function initialBlocks(
  catalog: Catalog,
  configuration: PracticeConfiguration | null | undefined,
) {
  if (!configuration) return [];
  const index = catalogConceptIndex(catalog);
  const blocks: BuilderBlock[] = [];
  for (const block of configuration.blocks) {
    if (block.selectionType !== 'concept') continue;
    const match = index.get(block.conceptId);
    if (!match) continue;
    const validCourses = new Set(match.concept.courses.map((course) => course.id));
    const courseIds = block.courseIds.filter((courseId) => validCourses.has(courseId));
    if (!courseIds.length) continue;
    blocks.push({
      key: block.key,
      subjectId: match.subjectId,
      subjectName: match.subjectName,
      groupName: match.groupName,
      concept: match.concept,
      courseIds,
      requestedCount: block.requestedCount,
    });
  }
  return blocks;
}

function savedOption(value: boolean | null) {
  return value === true ? 'saved' : value === false ? 'not_saved' : 'any';
}

function calculatorOption(value: boolean | null) {
  return value === true ? 'allowed' : value === false ? 'not_allowed' : 'any';
}

function optionBoolean(value: string) {
  if (value === 'saved' || value === 'allowed') return true;
  if (value === 'not_saved' || value === 'not_allowed') return false;
  return null;
}

function makeBlock(
  subject: CatalogSubject,
  groupName: string,
  concept: CatalogConcept,
): BuilderBlock {
  const courseIds = initialCourses(concept);
  const available = concept.courses
    .filter((course) => courseIds.includes(course.id))
    .reduce((total, course) => total + course.questionCount, 0);
  return {
    key: `block-${crypto.randomUUID()}`,
    subjectId: subject.id,
    subjectName: subject.name,
    groupName,
    concept,
    courseIds,
    requestedCount: Math.max(1, Math.min(10, available || 10)),
  };
}

export function PracticeSetBuilderV4({
  catalog,
  initialConfiguration,
  sharedSource,
}: {
  catalog: Catalog;
  initialConfiguration?: PracticeConfiguration | null;
  sharedSource?: SharedBuilderSource | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [blocks, setBlocks] = useState<BuilderBlock[]>(() =>
    initialBlocks(catalog, initialConfiguration),
  );
  const [difficulties, setDifficulties] = useState<string[]>(() =>
    initialConfiguration?.filters.difficulties || [
      'easy',
      'medium',
      'hard',
      'unrated',
    ],
  );
  const [statuses, setStatuses] = useState<string[]>(() =>
    initialConfiguration?.filters.statuses || [
      'not_started',
      'in_progress',
      'completed',
    ],
  );
  const [saved, setSaved] = useState<boolean | null>(
    initialConfiguration?.filters.saved ?? null,
  );
  const [calculator, setCalculator] = useState<boolean | null>(
    initialConfiguration?.filters.calculator ?? null,
  );
  const [orderingMode, setOrderingMode] = useState<PracticeOrderingMode>(
    initialConfiguration?.orderingMode || 'interleaved',
  );
  const [preview, setPreview] = useState<PracticePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isMaximizing, setIsMaximizing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const previewRequest = useRef(0);

  const selectedConceptIds = useMemo(
    () => new Set(blocks.map((block) => block.concept.id)),
    [blocks],
  );
  const totalRequested = useMemo(
    () => blocks.reduce((total, block) => total + block.requestedCount, 0),
    [blocks],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredSubjects = catalog.subjects
    .map((subject) => ({
      ...subject,
      groups: subject.groups
        .map((group) => ({
          ...group,
          concepts: group.concepts.filter((concept) => {
            if (!normalizedSearch) return true;
            return [
              subject.name,
              group.name,
              concept.name,
              concept.description,
              ...concept.aliases,
            ].some((value) =>
              String(value).toLocaleLowerCase().includes(normalizedSearch),
            );
          }),
        }))
        .filter((group) => group.concepts.length),
    }))
    .filter((subject) => subject.groups.length);

  const configuration = useMemo<PracticeConfiguration | null>(() => {
    if (
      !blocks.length ||
      blocks.some(
        (block) => !block.courseIds.length || block.requestedCount < 1,
      )
    )
      return null;
    const filters: PracticeFilters = {
      difficulties:
        difficulties as PracticeConfiguration['filters']['difficulties'],
      statuses: statuses as PracticeConfiguration['filters']['statuses'],
      saved,
      calculator,
    };
    return {
      schemaVersion: 1,
      orderingMode,
      filters,
      blocks: blocks.map((block) => ({
        key: block.key,
        selectionType: 'concept' as const,
        conceptId: block.concept.id,
        courseIds: block.courseIds,
        requestedCount: block.requestedCount,
        filters: { ...filters },
      })),
    };
  }, [blocks, calculator, difficulties, orderingMode, saved, statuses]);

  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (!configuration) {
      setPreviewLoading(false);
      return;
    }
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setPreviewLoading(true);
      fetch('/api/question-bank/practice-builder/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(payload.error || 'Unable to preview this set.');
          return payload.preview as PracticePreview;
        })
        .then((nextPreview) => {
          if (previewRequest.current === requestId) setPreview(nextPreview);
        })
        .catch((error) => {
          if (error?.name !== 'AbortError' && previewRequest.current === requestId) {
            setPreviewError(
              error instanceof Error ? error.message : 'Unable to preview this set.',
            );
          }
        })
        .finally(() => {
          if (previewRequest.current === requestId) setPreviewLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [configuration]);


  function updateBlock(key: string, patch: Partial<BuilderBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  }

  function addConcept(
    subject: CatalogSubject,
    groupName: string,
    concept: CatalogConcept,
  ) {
    if (selectedConceptIds.has(concept.id)) return;
    setBlocks((current) => [...current, makeBlock(subject, groupName, concept)]);
  }

  function selectAllSubject(subject: CatalogSubject) {
    setBlocks((current) => {
      const selected = new Set(current.map((block) => block.concept.id));
      const additions = subject.groups.flatMap((group) =>
        group.concepts
          .filter((concept) => !selected.has(concept.id))
          .map((concept) => makeBlock(subject, group.name, concept)),
      );
      return additions.length ? [...current, ...additions] : current;
    });
  }

  function removeSubject(subjectId: string) {
    setBlocks((current) =>
      current.filter((block) => block.subjectId !== subjectId),
    );
  }

  function useAllCourses(block: BuilderBlock) {
    const courseIds = block.concept.courses.map((course) => course.id);
    const upper = block.concept.courses.reduce(
      (total, course) => total + course.questionCount,
      0,
    );
    updateBlock(block.key, {
      courseIds,
      requestedCount: Math.max(1, Math.min(block.requestedCount || 1, upper || 1)),
    });
  }

  function useAllCoursesForAllBlocks() {
    setBlocks((current) =>
      current.map((block) => {
        const courseIds = block.concept.courses.map((course) => course.id);
        const upper = block.concept.courses.reduce(
          (total, course) => total + course.questionCount,
          0,
        );
        return {
          ...block,
          courseIds,
          requestedCount: Math.max(
            1,
            Math.min(block.requestedCount || 1, upper || 1),
          ),
        };
      }),
    );
  }

  function toggleCourse(block: BuilderBlock, courseId: string) {
    const nextCourseIds = block.courseIds.includes(courseId)
      ? block.courseIds.filter((id) => id !== courseId)
      : [...block.courseIds, courseId];
    const upper = block.concept.courses
      .filter((course) => nextCourseIds.includes(course.id))
      .reduce((total, course) => total + course.questionCount, 0);
    updateBlock(block.key, {
      courseIds: nextCourseIds,
      requestedCount: nextCourseIds.length
        ? Math.max(1, Math.min(block.requestedCount, upper || block.requestedCount))
        : Math.max(1, block.requestedCount),
    });
  }

  function setRequestedCount(
    block: BuilderBlock,
    requested: number,
    previewBlock?: PracticePreviewBlock,
  ) {
    const maximum = maximumForBlock(block, previewBlock);
    updateBlock(block.key, {
      requestedCount: Math.max(maximum > 0 ? 1 : 0, Math.min(maximum, Math.floor(requested || 0))),
    });
  }

  function toggleListValue(
    value: string,
    selected: string[],
    setter: (next: string[]) => void,
  ) {
    setter(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  async function maximizeAll() {
    if (isMaximizing || !blocks.length) return;
    setIsMaximizing(true);

    const filters: PracticeFilters = {
      difficulties:
        difficulties as PracticeConfiguration['filters']['difficulties'],
      statuses: statuses as PracticeConfiguration['filters']['statuses'],
      saved,
      calculator,
    };

    function configurationFor(nextBlocks: BuilderBlock[]): PracticeConfiguration {
      return {
        schemaVersion: 1,
        orderingMode,
        filters,
        blocks: nextBlocks.map((block) => ({
          key: block.key,
          selectionType: 'concept' as const,
          conceptId: block.concept.id,
          courseIds: [...block.courseIds],
          requestedCount: Math.max(1, block.requestedCount),
          filters: { ...filters },
        })),
      };
    }

    async function requestMaximum(nextConfiguration: PracticeConfiguration) {
      const response = await fetch('/api/question-bank/practice-builder/maximize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration: nextConfiguration }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Unable to calculate the maximum.');
      return payload.maximum as PracticeMaximumPreview;
    }

    try {
      let workingBlocks = blocks.map((block) =>
        block.courseIds.length
          ? { ...block, requestedCount: Math.max(1, block.requestedCount) }
          : {
              ...block,
              courseIds: block.concept.courses.map((course) => course.id),
              requestedCount: Math.max(1, block.requestedCount),
            },
      );
      let maximum = await requestMaximum(configurationFor(workingBlocks));
      const zeroAllocationKeys = new Set(
        maximum.blocks
          .filter(
            (result) =>
              result.candidateCount < 1 || result.recommendedCount < 1,
          )
          .map((result) => result.key),
      );

      if (zeroAllocationKeys.size) {
        workingBlocks = workingBlocks.map((block) =>
          zeroAllocationKeys.has(block.key)
            ? {
                ...block,
                courseIds: block.concept.courses.map((course) => course.id),
                requestedCount: Math.max(1, block.requestedCount),
              }
            : block,
        );
        maximum = await requestMaximum(configurationFor(workingBlocks));
      }

      const unresolved = maximum.blocks.filter(
        (result) => result.candidateCount < 1 || result.recommendedCount < 1,
      );
      if (unresolved.length)
        throw new Error(
          unresolved.length +
            ' selected topic' +
            (unresolved.length === 1 ? '' : 's') +
            ' could not supply a unique question. Try clearing restrictive filters.',
        );

      const byKey = new Map(maximum.blocks.map((result) => [result.key, result]));
      setBlocks(
        workingBlocks.map((block) => {
          const result = byKey.get(block.key);
          return result
            ? { ...block, requestedCount: result.recommendedCount }
            : block;
        }),
      );
      toast.success(
        'Maximized to ' +
          maximum.totalUniqueAllocated.toLocaleString() +
          ' unique questions across the selected topics.' +
          (zeroAllocationKeys.size
            ? ' Topics with zero allocation were expanded to all available courses.'
            : ''),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to calculate the maximum.',
      );
    } finally {
      setIsMaximizing(false);
    }
  }

  async function startSession() {
    if (!configuration || !preview?.feasible || isStarting) return;
    setIsStarting(true);
    try {
      const response = await fetch('/api/question-bank/practice-builder/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Unable to create this session.');
      toast.success('Your practice session is ready.');
      router.push(`/question-bank/practice/${payload.sessionId}`);
    } catch (error) {
      setIsStarting(false);
      toast.error(
        error instanceof Error ? error.message : 'Unable to create this session.',
      );
    }
  }

  return (
    <>
      {sharedSource ? (
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/35 dark:text-blue-100">
          <strong>{sharedSource.name}</strong> by {sharedSource.creatorLabel}{' '}
          <span className="font-mono">({sharedSource.code})</span> has been loaded into
          the builder. Every setting below remains editable.
        </section>
      ) : null}

      <div className="mt-6 grid gap-5 xl:h-[calc(100dvh-7.5rem)] xl:grid-cols-[minmax(300px,0.85fr)_minmax(460px,1.3fr)_330px] xl:items-stretch">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:flex xl:min-h-0 xl:flex-col">
          <div className="shrink-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
              1 · Add content
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
              Subjects and topics
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Add one topic, a complete subject, or selections from several subjects.
            </p>
            <label
              className={`${styles.searchShell} mt-4 flex items-center gap-2 rounded-xl border px-3 py-2`}
            >
              <Search className="size-4 text-slate-500" />
              <span className="sr-only">Search topics and concepts</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subjects or topics"
                className={`${styles.searchInput} min-w-0 flex-1 border-0 bg-transparent text-sm outline-none`}
              />
            </label>
          </div>

          <div className="mt-4 space-y-3 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {filteredSubjects.map((subject) => {
              const fullSubject =
                catalog.subjects.find((candidate) => candidate.id === subject.id) ||
                subject;
              const concepts = fullSubject.groups.flatMap(
                (group) => group.concepts,
              );
              const selectedInSubject = concepts.filter((concept) =>
                selectedConceptIds.has(concept.id),
              ).length;
              const allSelected = selectedInSubject === concepts.length;
              return (
                <details key={subject.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4" />
                    {subject.name}
                    <span className="ml-auto text-xs font-normal text-slate-500 dark:text-slate-400">
                      {selectedInSubject ? `${selectedInSubject}/` : ''}{concepts.length}
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={allSelected}
                        onClick={() => selectAllSubject(fullSubject)}
                        className={`${styles.countButton} inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold`}
                      >
                        <CheckSquare2 className="size-4" />
                        {allSelected ? 'All topics selected' : 'Select all topics'}
                      </button>
                      {selectedInSubject ? (
                        <button
                          type="button"
                          onClick={() => removeSubject(subject.id)}
                          className={`${styles.deleteButton} rounded-lg px-3 py-2 text-xs font-semibold`}
                        >
                          Remove subject selections
                        </button>
                      ) : null}
                    </div>

                    {subject.groups.map((group) => (
                      <section key={group.id}>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {group.name}
                        </h3>
                        <div className="mt-2 space-y-2">
                          {group.concepts.map((concept) => {
                            const selected = selectedConceptIds.has(concept.id);
                            return (
                              <button
                                key={concept.id}
                                type="button"
                                disabled={selected}
                                onClick={() => addConcept(fullSubject, group.name, concept)}
                                className={`${styles.conceptButton} ${
                                  selected ? styles.conceptButtonSelected : ''
                                } flex w-full items-center gap-3 rounded-xl border p-3 text-left`}
                              >
                                <span
                                  className={`${styles.conceptIcon} flex size-8 shrink-0 items-center justify-center rounded-lg`}
                                >
                                  {selected ? (
                                    <Check className="size-4" />
                                  ) : (
                                    <Plus className="size-4" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <strong className="block text-sm">{concept.name}</strong>
                                  <small className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                                    {concept.courses.length} course collection
                                    {concept.courses.length === 1 ? '' : 's'}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              );
            })}
            {!filteredSubjects.length ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                No topics match that search.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:flex xl:min-h-0 xl:flex-col">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                2 · Configure selections
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
                Your selected content
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Every topic can use its own courses and question amount.
              </p>
            </div>
            {blocks.length ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={blocks.every(
                    (block) =>
                      block.courseIds.length === block.concept.courses.length,
                  )}
                  onClick={useAllCoursesForAllBlocks}
                  className={`${styles.countButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
                >
                  <CheckSquare2 className="size-4" />
                  Use all courses
                </button>
                <button
                  type="button"
                  disabled={isMaximizing}
                  onClick={() => void maximizeAll()}
                  className={`${styles.countButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
                >
                  {isMaximizing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ListChecks className="size-4" />
                  )}
                  Max all
                </button>
                <button
                  type="button"
                  onClick={() => setBlocks([])}
                  className={`${styles.deleteButton} min-h-10 rounded-xl px-3 py-2 text-sm font-semibold`}
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-4 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {blocks.map((block, blockIndex) => {
              const blockPreview = preview?.blocks.find((row) => row.key === block.key);
              const maximum = maximumForBlock(block, blockPreview);
              const allCoursesSelected =
                block.courseIds.length === block.concept.courses.length;
              return (
                <article key={block.key} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <header className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--dp-navy)] text-sm font-semibold text-white">
                      {blockIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {block.subjectName} · {block.groupName}
                      </p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-50">
                        {block.concept.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBlocks((current) =>
                          current.filter((item) => item.key !== block.key),
                        )
                      }
                      className={`${styles.deleteButton} rounded-lg p-2`}
                      aria-label={`Remove ${block.concept.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </header>

                  <fieldset className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Courses for this topic
                      </legend>
                      <button
                        type="button"
                        disabled={allCoursesSelected}
                        onClick={() => useAllCourses(block)}
                        className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                      >
                        {allCoursesSelected ? 'All courses selected' : 'Use all courses'}
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {block.concept.courses.map((course) => {
                        const selected = block.courseIds.includes(course.id);
                        return (
                          <label
                            key={course.id}
                            className={`${styles.courseOption} ${
                              selected ? styles.courseOptionSelected : ''
                            } flex cursor-pointer gap-2 rounded-xl border p-3`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleCourse(block, course.id)}
                              className="mt-0.5"
                            />
                            <span>
                              <strong className="block text-sm text-slate-800 dark:text-slate-100">
                                {course.name}
                              </strong>
                              <small className="block text-xs text-slate-500 dark:text-slate-400">
                                {course.syllabusLabel || course.level || 'Course'} ·{' '}
                                {course.questionCount.toLocaleString()} unique available
                              </small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {!block.courseIds.length ? (
                      <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
                        Select at least one course for this topic.
                      </p>
                    ) : null}
                  </fieldset>

                  <div className="mt-4">
                    <div className="flex items-end justify-between gap-3">
                      <label className="block max-w-48 flex-1">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Questions from this topic
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={block.requestedCount}
                          onChange={(event) =>
                            setRequestedCount(
                              block,
                              Number(event.target.value.replace(/\D/g, '')),
                              blockPreview,
                            )
                          }
                          className={`${styles.countInput} mt-2 w-full rounded-xl border px-3 py-2`}
                          aria-label={`Questions from ${block.concept.name}`}
                        />
                      </label>
                      <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">
                        Maximum {maximum.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[10, 100].map((increment) => (
                        <button
                          key={increment}
                          type="button"
                          disabled={maximum === 0 || block.requestedCount >= maximum}
                          onClick={() =>
                            setRequestedCount(
                              block,
                              block.requestedCount + increment,
                              blockPreview,
                            )
                          }
                          className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                        >
                          +{increment}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={maximum === 0 || block.requestedCount >= maximum}
                        onClick={() => setRequestedCount(block, maximum, blockPreview)}
                        className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                      >
                        Max topic
                      </button>
                    </div>
                  </div>

                  {blockPreview ? (
                    <div
                      className={`${
                        blockPreview.shortage
                          ? styles.previewWarning
                          : styles.previewSuccess
                      } mt-4 rounded-xl px-3 py-2 text-sm`}
                    >
                      {blockPreview.candidateCount.toLocaleString()} unique candidates ·{' '}
                      {blockPreview.shortage
                        ? `${blockPreview.requestedCount.toLocaleString()} requested · short by ${blockPreview.shortage.toLocaleString()}`
                        : `${blockPreview.allocatedCount.toLocaleString()} allocated`}
                      {blockPreview.overlapQuestionCount
                        ? ` · ${blockPreview.overlapQuestionCount.toLocaleString()} also match another selection`
                        : ''}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {!blocks.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <BookOpenCheck className="mx-auto size-9 text-slate-400" />
                <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  Add your first topic
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Select one topic, a whole subject, or a mixture of subjects.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 xl:flex xl:min-h-0 xl:flex-col xl:space-y-0">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
              3 · Session settings
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
              Mix and filters
            </h2>

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">Difficulty</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={difficulties.includes(value)}
                      onChange={() =>
                        toggleListValue(value, difficulties, setDifficulties)
                      }
                    />
                    {human(value)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">Progress</legend>
              <div className="mt-2 space-y-2">
                {STATUSES.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={statuses.includes(value)}
                      onChange={() => toggleListValue(value, statuses, setStatuses)}
                    />
                    {human(value)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={`${styles.orderSelect} mt-4`}>
              <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Saved status
              </span>
              <AppSelect
                value={savedOption(saved)}
                onValueChange={(value) => setSaved(optionBoolean(value))}
                options={SAVED_OPTIONS}
                placeholder="Choose saved status"
              />
            </div>

            <div className={`${styles.orderSelect} mt-4`}>
              <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Calculator
              </span>
              <AppSelect
                value={calculatorOption(calculator)}
                onValueChange={(value) => setCalculator(optionBoolean(value))}
                options={CALCULATOR_OPTIONS}
                placeholder="Choose calculator status"
              />
            </div>

            <div className={`${styles.orderSelect} mt-4`}>
              <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Question order
              </span>
              <AppSelect
                value={orderingMode}
                onValueChange={(value) =>
                  setOrderingMode(value as PracticeOrderingMode)
                }
                options={ORDER_OPTIONS}
                placeholder="Choose question order"
              />
            </div>
          </section>

          <section className={`${styles.summaryCard} rounded-2xl p-4 shadow-lg xl:mt-4 xl:shrink-0`}>
            <div className="flex items-center gap-2">
              <ListChecks className="size-5" />
              <h2 className="font-semibold">Practice-set summary</h2>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-blue-100">Requested</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {totalRequested.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-blue-100">Subjects</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {new Set(blocks.map((block) => block.subjectName)).size}
                </dd>
              </div>
              <div>
                <dt className="text-blue-100">Selections</dt>
                <dd className="mt-0.5 text-xl font-semibold">{blocks.length}</dd>
              </div>
              <div>
                <dt className="text-blue-100">Unique available</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {preview?.totalUniqueAvailable.toLocaleString() || '—'}
                </dd>
              </div>
            </dl>
            {totalRequested > 500 ? (
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-blue-50">
                This large fixed queue will be stored in full and displayed in pages,
                so you can leave and resume without loading every question at once.
              </p>
            ) : null}
            {preview?.overlappingQuestionCount ? (
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-blue-50">
                {preview.overlappingQuestionCount.toLocaleString()} questions match
                multiple selections and will appear only once.
              </p>
            ) : null}
            {previewLoading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-blue-50">
                <Loader2 className="size-4 animate-spin" /> Checking availability…
              </p>
            ) : null}
            {previewError ? (
              <p className="mt-3 rounded-xl bg-red-950/40 px-3 py-2 text-sm text-red-100">
                {previewError} You can still share the configuration or change the
                selections and retry.
              </p>
            ) : null}
            {preview && !preview.feasible ? (
              <p className="mt-3 rounded-xl bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
                These individual amounts compete for overlapping questions. Use Max
                all for the largest jointly possible set, or reduce the highlighted
                amounts.
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void startSession()}
                disabled={
                  !configuration ||
                  !preview?.feasible ||
                  previewLoading ||
                  isStarting
                }
                className={`${styles.summaryButton} flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isStarting ? <Loader2 className="size-4 animate-spin" /> : null}
                Start practice
              </button>
              <PracticeShareDialog
                configuration={configuration}
                disabled={!configuration}
                appearance="summary"
                buttonLabel="Share configuration"
              />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
