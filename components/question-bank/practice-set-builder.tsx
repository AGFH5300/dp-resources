'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { PracticeOrderingMode } from '@/lib/question-bank/practice-allocation';
import type { PracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import type { PracticePreview } from '@/lib/question-bank/practice-engine';

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

export function PracticeSetBuilder({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const [isStarting, startTransition] = useTransition();
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
  const previewRequest = useRef(0);

  const selectedConceptIds = useMemo(
    () => new Set(blocks.map((block) => block.concept.id)),
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
    if (!blocks.length || blocks.some((block) => !block.courseIds.length)) return null;
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
  }, [blocks, difficulties, orderingMode, statuses]);

  useEffect(() => {
    if (!configuration) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError('');
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
            setPreview(null);
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

  function addConcept(
    subjectName: string,
    groupName: string,
    concept: CatalogConcept,
  ) {
    if (selectedConceptIds.has(concept.id)) return;
    const courseIds = initialCourses(concept);
    const available = concept.courses
      .filter((course) => courseIds.includes(course.id))
      .reduce((total, course) => total + course.questionCount, 0);
    setBlocks((current) => [
      ...current,
      {
        key: `block-${current.length + 1}-${concept.slug}`,
        subjectName,
        groupName,
        concept,
        courseIds,
        requestedCount: Math.max(1, Math.min(10, available || 10)),
      },
    ]);
  }

  function updateBlock(key: string, patch: Partial<BuilderBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  }

  function toggleCourse(block: BuilderBlock, courseId: string) {
    const selected = block.courseIds.includes(courseId);
    updateBlock(block.key, {
      courseIds: selected
        ? block.courseIds.filter((id) => id !== courseId)
        : [...block.courseIds, courseId],
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
    if (!configuration || !preview?.feasible) return;
    startTransition(async () => {
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
        toast.error(
          error instanceof Error ? error.message : 'Unable to create this session.',
        );
      }
    });
  }

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.25fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            1 · Add content
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
            Subjects and concepts
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Combine concepts from different subjects in the same set.
          </p>
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
          <Search className="size-4 text-slate-500" />
          <span className="sr-only">Search concepts</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subjects or concepts"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="mt-4 max-h-[66vh] space-y-3 overflow-y-auto pr-1">
          {filteredSubjects.map((subject) => (
            <details key={subject.id} open className="rounded-xl border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4" />
                {subject.name}
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-3">
                {subject.groups.map((group) => (
                  <section key={group.id}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.name}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {group.concepts.map((concept) => {
                        const selected = selectedConceptIds.has(concept.id);
                        const total = new Set(
                          concept.courses.flatMap((course) => [course.id]),
                        ).size;
                        return (
                          <button
                            key={concept.id}
                            type="button"
                            disabled={selected}
                            onClick={() =>
                              addConcept(subject.name, group.name, concept)
                            }
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:bg-slate-50 disabled:opacity-65"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                              {selected ? (
                                <Check className="size-4" />
                              ) : (
                                <Plus className="size-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block text-sm text-slate-800">
                                {concept.name}
                              </strong>
                              <small className="mt-0.5 block text-xs text-slate-500">
                                {concept.courses.length} course collection
                                {concept.courses.length === 1 ? '' : 's'} · {total} mapped
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
              No concepts match that search.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            2 · Configure each block
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
            Your selected content
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Every concept can use its own courses and question quota.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {blocks.map((block, blockIndex) => {
            const blockPreview = preview?.blocks.find((row) => row.key === block.key);
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
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    aria-label={`Remove ${block.concept.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </header>

                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold text-slate-700">
                    Courses for this concept
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {block.concept.courses.map((course) => {
                      const selected = block.courseIds.includes(course.id);
                      return (
                        <label
                          key={course.id}
                          className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${
                            selected
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-slate-200 bg-white'
                          }`}
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
                      Select at least one course for this concept.
                    </p>
                  ) : null}
                </fieldset>

                <label className="mt-4 block max-w-48">
                  <span className="text-sm font-semibold text-slate-700">
                    Questions from this block
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={block.requestedCount}
                    onChange={(event) =>
                      updateBlock(block.key, {
                        requestedCount: Math.max(
                          1,
                          Math.min(200, Number(event.target.value) || 1),
                        ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>

                {blockPreview ? (
                  <div
                    className={`mt-4 rounded-xl px-3 py-2 text-sm ${
                      blockPreview.shortage
                        ? 'bg-amber-50 text-amber-900'
                        : 'bg-emerald-50 text-emerald-900'
                    }`}
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
                Add your first concept
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Select concepts from the catalogue. They can come from different subjects.
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

          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Question order</span>
            <select
              value={orderingMode}
              onChange={(event) =>
                setOrderingMode(event.target.value as PracticeOrderingMode)
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="interleaved">Interleave selected concepts</option>
              <option value="mixed">Mix randomly</option>
              <option value="grouped">Group by concept</option>
              <option value="easier_to_harder">Easier to harder</option>
              <option value="source_order">Source order</option>
            </select>
          </label>
        </section>

        <section className="rounded-2xl bg-[color:var(--dp-navy)] p-4 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5" />
            <h2 className="font-semibold">Practice-set summary</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-blue-200">Requested</dt>
              <dd className="mt-0.5 text-xl font-semibold">
                {blocks.reduce((total, block) => total + block.requestedCount, 0)}
              </dd>
            </div>
            <div>
              <dt className="text-blue-200">Subjects</dt>
              <dd className="mt-0.5 text-xl font-semibold">
                {new Set(blocks.map((block) => block.subjectName)).size}
              </dd>
            </div>
            <div>
              <dt className="text-blue-200">Concepts</dt>
              <dd className="mt-0.5 text-xl font-semibold">{blocks.length}</dd>
            </div>
            <div>
              <dt className="text-blue-200">Unique available</dt>
              <dd className="mt-0.5 text-xl font-semibold">
                {preview?.totalUniqueAvailable.toLocaleString() || '—'}
              </dd>
            </div>
          </dl>
          {preview?.overlappingQuestionCount ? (
            <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-blue-100">
              {preview.overlappingQuestionCount} questions match multiple selected blocks;
              they will appear only once.
            </p>
          ) : null}
          {previewLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-blue-100">
              <Loader2 className="size-4 animate-spin" /> Checking availability…
            </p>
          ) : null}
          {previewError ? (
            <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-sm">
              {previewError}
            </p>
          ) : null}
          {preview && !preview.feasible ? (
            <p className="mt-3 rounded-xl bg-amber-300/20 px-3 py-2 text-sm text-amber-50">
              One or more blocks do not have enough eligible questions. Adjust the
              courses, filters or requested counts.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startSession()}
            disabled={!configuration || !preview?.feasible || previewLoading || isStarting}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-[color:var(--dp-navy)] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? <Loader2 className="size-4 animate-spin" /> : null}
            Start practice
          </button>
        </section>
      </aside>
    </div>
  );
}
