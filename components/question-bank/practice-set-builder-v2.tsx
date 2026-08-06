'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  Layers3,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { AppSelect } from '@/components/ui/app-select';
import type { PracticeOrderingMode } from '@/lib/question-bank/practice-allocation';
import type { PracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import type {
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

type Catalog = {
  subjects: Array<{
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
  }>;
};

type BuilderBlock = {
  key: string;
  subjectName: string;
  groupName: string;
  concept: CatalogConcept;
  courseIds: string[];
  requestedCount: number;
};

const DIFFICULTIES = ['easy', 'medium', 'hard', 'unrated'] as const;
const STATUSES = ['not_started', 'in_progress', 'completed'] as const;
const SESSION_MAXIMUM = 200;
const BLOCK_MAXIMUM = 200;
const BLOCK_LIMIT = 20;

const ORDER_OPTIONS = [
  { value: 'interleaved', label: 'Interleave selected concepts' },
  { value: 'mixed', label: 'Mix randomly' },
  { value: 'grouped', label: 'Group by concept' },
  { value: 'easier_to_harder', label: 'Easier to harder' },
  { value: 'source_order', label: 'Source order' },
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
  blocks: BuilderBlock[],
  previewBlock?: PracticePreviewBlock,
) {
  const requestedElsewhere = blocks.reduce(
    (total, item) => total + (item.key === block.key ? 0 : item.requestedCount),
    0,
  );
  const sessionRoom = Math.max(0, SESSION_MAXIMUM - requestedElsewhere);
  const candidateMaximum =
    previewBlock?.candidateCount ?? selectedCourseUpperBound(block);
  return Math.max(
    0,
    Math.min(BLOCK_MAXIMUM, sessionRoom, candidateMaximum),
  );
}

export function PracticeSetBuilderV2({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([
    'easy',
    'medium',
    'hard',
    'unrated',
  ]);
  const [statuses, setStatuses] = useState<string[]>([
    'not_started',
    'in_progress',
    'completed',
  ]);
  const [orderingMode, setOrderingMode] =
    useState<PracticeOrderingMode>('interleaved');
  const [preview, setPreview] = useState<PracticePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
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
      ) ||
      totalRequested > SESSION_MAXIMUM
    )
      return null;
    return {
      schemaVersion: 1,
      orderingMode,
      filters: {
        difficulties: difficulties as PracticeConfiguration['filters']['difficulties'],
        statuses: statuses as PracticeConfiguration['filters']['statuses'],
        saved: null,
        calculator: null,
        sourceSlugs: [],
      },
      blocks: blocks.map((block) => ({
        key: block.key,
        selectionType: 'concept' as const,
        conceptId: block.concept.id,
        courseIds: block.courseIds,
        requestedCount: block.requestedCount,
        filters: {
          difficulties:
            difficulties as PracticeConfiguration['filters']['difficulties'],
          statuses: statuses as PracticeConfiguration['filters']['statuses'],
          saved: null,
          calculator: null,
        },
      })),
    };
  }, [blocks, difficulties, orderingMode, statuses, totalRequested]);

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
    const timeout = window.setTimeout(() => {
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
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [configuration]);

  useEffect(() => {
    if (!preview) return;
    setBlocks((current) => {
      let changed = false;
      const next = current.map((block) => {
        const row = preview.blocks.find((item) => item.key === block.key);
        if (!row || block.requestedCount <= row.candidateCount) return block;
        changed = true;
        return { ...block, requestedCount: row.candidateCount };
      });
      return changed ? next : current;
    });
  }, [preview]);

  function updateBlock(key: string, patch: Partial<BuilderBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  }

  function addConcept(
    subjectName: string,
    groupName: string,
    concept: CatalogConcept,
  ) {
    if (selectedConceptIds.has(concept.id)) return;
    if (blocks.length >= BLOCK_LIMIT) {
      toast.error(`A practice set can contain at most ${BLOCK_LIMIT} concepts.`);
      return;
    }
    const courseIds = initialCourses(concept);
    const available = concept.courses
      .filter((course) => courseIds.includes(course.id))
      .reduce((total, course) => total + course.questionCount, 0);
    const sessionRoom = SESSION_MAXIMUM - totalRequested;
    if (sessionRoom < 1) {
      toast.error(`A practice session can contain at most ${SESSION_MAXIMUM} questions.`);
      return;
    }
    setBlocks((current) => [
      ...current,
      {
        key: `block-${crypto.randomUUID()}`,
        subjectName,
        groupName,
        concept,
        courseIds,
        requestedCount: Math.max(1, Math.min(10, available || 10, sessionRoom)),
      },
    ]);
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
        ? Math.min(block.requestedCount, upper || block.requestedCount)
        : 0,
    });
  }

  function setRequestedCount(
    block: BuilderBlock,
    requested: number,
    previewBlock?: PracticePreviewBlock,
  ) {
    const maximum = maximumForBlock(block, blocks, previewBlock);
    updateBlock(block.key, {
      requestedCount: Math.max(0, Math.min(maximum, Math.floor(requested || 0))),
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
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.25fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          1 · Add content
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
          Subjects and topics
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Combine topics and reviewed concepts from any available subject.
        </p>
        <label
          className={`${styles.searchShell} mt-4 flex items-center gap-2 rounded-xl border px-3 py-2`}
        >
          <Search className="size-4 text-slate-500" />
          <span className="sr-only">Search topics and concepts</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subjects, topics or concepts"
            className={`${styles.searchInput} min-w-0 flex-1 border-0 bg-transparent text-sm outline-none`}
          />
        </label>
        <div className="mt-4 max-h-[66vh] space-y-3 overflow-y-auto pr-1">
          {filteredSubjects.map((subject) => (
            <details key={subject.id} className="rounded-xl border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4" />
                {subject.name}
                <span className="ml-auto text-xs font-normal text-slate-500">
                  {subject.groups.reduce(
                    (total, group) => total + group.concepts.length,
                    0,
                  )}
                </span>
              </summary>
              <div className="space-y-4 border-t border-slate-200 p-3">
                {subject.groups.map((group) => (
                  <section key={group.id}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                            onClick={() =>
                              addConcept(subject.name, group.name, concept)
                            }
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
                              <small className="mt-0.5 block text-xs text-slate-500">
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
          ))}
          {!filteredSubjects.length ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No topics or concepts match that search.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          2 · Configure each block
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
          Your selected content
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Every selection can use its own courses and question quota.
        </p>

        <div className="mt-4 space-y-4">
          {blocks.map((block, blockIndex) => {
            const blockPreview = preview?.blocks.find((row) => row.key === block.key);
            const maximum = maximumForBlock(block, blocks, blockPreview);
            return (
              <article key={block.key} className="rounded-2xl border border-slate-200 p-4">
                <header className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--dp-navy)] text-sm font-semibold text-white">
                    {blockIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {block.subjectName} · {block.groupName}
                    </p>
                    <h3 className="mt-0.5 text-base font-semibold text-slate-900">
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
                  <legend className="text-sm font-semibold text-slate-700">
                    Courses for this selection
                  </legend>
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
                            <strong className="block text-sm text-slate-800">
                              {course.name}
                            </strong>
                            <small className="block text-xs text-slate-500">
                              {course.syllabusLabel || course.level || 'Course'} ·{' '}
                              {course.questionCount.toLocaleString()} unique available
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {!block.courseIds.length ? (
                    <p className="mt-2 text-sm font-medium text-red-700">
                      Select at least one course for this block.
                    </p>
                  ) : null}
                </fieldset>

                <div className="mt-4">
                  <div className="flex items-end justify-between gap-3">
                    <label className="block max-w-48 flex-1">
                      <span className="text-sm font-semibold text-slate-700">
                        Questions from this block
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
                    <span className="pb-2 text-xs text-slate-500">
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
                      onClick={() =>
                        setRequestedCount(block, maximum, blockPreview)
                      }
                      className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                    >
                      Max
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
                    {blockPreview.allocatedCount} allocated
                    {blockPreview.overlapQuestionCount
                      ? ` · ${blockPreview.overlapQuestionCount} overlap another block`
                      : ''}
                    {blockPreview.shortage
                      ? ` · short by ${blockPreview.shortage}`
                      : ''}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!blocks.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <BookOpenCheck className="mx-auto size-9 text-slate-400" />
              <h3 className="mt-3 font-semibold text-slate-800">
                Add your first topic or concept
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Your selections can come from different subjects and courses.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            3 · Session settings
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
            Mix and filters
          </h2>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-slate-700">Difficulty</legend>
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
            <legend className="text-sm font-semibold text-slate-700">Progress</legend>
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
            <span className="mb-2 block text-sm font-semibold text-slate-700">
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

        <section className={`${styles.summaryCard} rounded-2xl p-4 shadow-lg`}>
          <div className="flex items-center gap-2">
            <ListChecks className="size-5" />
            <h2 className="font-semibold">Practice-set summary</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-blue-100">Requested</dt>
              <dd className="mt-0.5 text-xl font-semibold">{totalRequested}</dd>
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
          {preview?.overlappingQuestionCount ? (
            <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-blue-50">
              {preview.overlappingQuestionCount} questions match multiple selected
              blocks and will appear only once.
            </p>
          ) : null}
          {previewLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-blue-50">
              <Loader2 className="size-4 animate-spin" /> Checking availability…
            </p>
          ) : null}
          {previewError ? (
            <p className="mt-3 rounded-xl bg-red-950/40 px-3 py-2 text-sm text-red-100">
              {previewError}
            </p>
          ) : null}
          {preview && !preview.feasible ? (
            <p className="mt-3 rounded-xl bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
              One or more blocks cannot fill the requested amount. The system will
              never silently exceed the available maximum.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startSession()}
            disabled={!configuration || !preview?.feasible || previewLoading || isStarting}
            className={`${styles.summaryButton} mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isStarting ? <Loader2 className="size-4 animate-spin" /> : null}
            Start practice
          </button>
        </section>
      </aside>
    </div>
  );
}
