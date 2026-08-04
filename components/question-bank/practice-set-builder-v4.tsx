'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  CheckSquare2,
  ChevronDown,
  ListChecks,
  Loader2,
  Maximize2,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PracticeShareDialog } from '@/components/question-bank/practice-share-dialog';
import { SubjectIcon } from '@/components/question-bank/subject-icon';
import { AppSelect } from '@/components/ui/app-select';
import type { PracticeOrderingMode } from '@/lib/question-bank/practice-allocation';
import {
  readPracticeApiJson,
  readPracticeBuildStream,
  type PracticeBuildProgress,
} from '@/lib/question-bank/practice-api-client';
import {
  readPracticeBuilderDraft,
  savePracticeBuilderDraft,
  type PracticeBuilderDraft,
} from '@/lib/question-bank/practice-builder-draft-storage';
import type {
  PracticeConfiguration,
  PracticeFilters,
} from '@/lib/question-bank/practice-configuration';
import { practiceCourseLabel } from '@/lib/question-bank/practice-course-label';
import {
  practiceSelectionLabel,
  singletonPracticeConceptIds,
} from '@/lib/question-bank/practice-selection-label';
import type {
  PracticeMaximumPreview,
  PracticePreview,
  PracticePreviewBlock,
  PracticePreviewGroupRequest,
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
  sourceConceptIds: string[];
  legacyConceptIds: string[];
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
  redirectConcepts: Array<{
    groupName: string;
    concept: CatalogConcept;
  }>;
};

type Catalog = { subjects: CatalogSubject[] };

type BuilderBlock = {
  key: string;
  subjectId: string;
  subjectSlug: string;
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
  {
    value: 'interleaved',
    label: 'Rotate between subtopics',
    description:
      'Takes one question from each selected subtopic in turn, then repeats.',
  },
  {
    value: 'mixed',
    label: 'Shuffle all questions',
    description: 'Mixes every selected question into one random order.',
  },
  {
    value: 'grouped',
    label: 'Finish one subtopic at a time',
    description: 'Keeps each subtopic together before moving to the next one.',
  },
  {
    value: 'easier_to_harder',
    label: 'Easier questions first',
    description:
      'Orders the selected questions by difficulty, from easier to harder.',
  },
  {
    value: 'source_order',
    label: 'Original source order',
    description:
      'Follows the questions’ original paper or source sequence where available.',
  },
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
  if (!previewBlock && block.requestedCount === 0) return 0;
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
      subjectSlug: string;
      subjectName: string;
      groupName: string;
      concept: CatalogConcept;
    }
  >();
  for (const subject of catalog.subjects) {
    for (const group of subject.groups) {
      for (const concept of group.concepts) {
        const match = {
          subjectId: subject.id,
          subjectSlug: subject.slug,
          subjectName: subject.name,
          groupName: group.name,
          concept,
        };
        index.set(concept.id, match);
        for (const sourceConceptId of concept.sourceConceptIds || [])
          index.set(sourceConceptId, match);
        for (const legacyConceptId of concept.legacyConceptIds || [])
          index.set(legacyConceptId, match);
      }
    }
    for (const redirect of subject.redirectConcepts || []) {
      const match = {
        subjectId: subject.id,
        subjectSlug: subject.slug,
        subjectName: subject.name,
        groupName: redirect.groupName,
        concept: redirect.concept,
      };
      index.set(redirect.concept.id, match);
      for (const sourceConceptId of redirect.concept.sourceConceptIds || [])
        index.set(sourceConceptId, match);
      for (const legacyConceptId of redirect.concept.legacyConceptIds || [])
        index.set(legacyConceptId, match);
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
      subjectSlug: match.subjectSlug,
      subjectName: match.subjectName,
      groupName: match.groupName,
      concept: match.concept,
      courseIds,
      requestedCount: block.requestedCount,
    });
  }
  return blocks;
}

function draftBlocks(catalog: Catalog, draft: PracticeBuilderDraft) {
  const index = catalogConceptIndex(catalog);
  return draft.blocks.flatMap((block): BuilderBlock[] => {
    const match = index.get(block.conceptId);
    if (!match) return [];
    const validCourses = new Set(match.concept.courses.map((course) => course.id));
    return [
      {
        key: block.key,
        subjectId: match.subjectId,
        subjectSlug: match.subjectSlug,
        subjectName: match.subjectName,
        groupName: match.groupName,
        concept: match.concept,
        courseIds: block.courseIds.filter((courseId) => validCourses.has(courseId)),
        requestedCount: block.requestedCount,
      },
    ];
  });
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

function PracticeSettingsFields({
  difficulties,
  statuses,
  saved,
  calculator,
  orderingMode,
  expanded = false,
  onToggleDifficulty,
  onToggleStatus,
  onSavedChange,
  onCalculatorChange,
  onOrderingModeChange,
}: {
  difficulties: string[];
  statuses: string[];
  saved: boolean | null;
  calculator: boolean | null;
  orderingMode: PracticeOrderingMode;
  expanded?: boolean;
  onToggleDifficulty: (value: string) => void;
  onToggleStatus: (value: string) => void;
  onSavedChange: (value: boolean | null) => void;
  onCalculatorChange: (value: boolean | null) => void;
  onOrderingModeChange: (value: PracticeOrderingMode) => void;
}) {
  const selectedOrderOption = ORDER_OPTIONS.find(
    (option) => option.value === orderingMode,
  );
  return (
    <div className={expanded ? styles.expandedSettingsGrid : ''}>
      <fieldset className={expanded ? styles.expandedSettingsSection : 'mt-4'}>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Difficulty
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {DIFFICULTIES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={difficulties.includes(value)}
                onChange={() => onToggleDifficulty(value)}
              />
              {human(value)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={expanded ? styles.expandedSettingsSection : 'mt-4'}>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Progress
        </legend>
        <div className="mt-2 space-y-2">
          {STATUSES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={statuses.includes(value)}
                onChange={() => onToggleStatus(value)}
              />
              {human(value)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`${styles.orderSelect} ${expanded ? styles.expandedSettingsSection : 'mt-4'}`}>
        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Saved status
        </span>
        <AppSelect
          value={savedOption(saved)}
          onValueChange={(value) => onSavedChange(optionBoolean(value))}
          options={SAVED_OPTIONS}
          placeholder="Choose saved status"
        />
      </div>

      <div className={`${styles.orderSelect} ${expanded ? styles.expandedSettingsSection : 'mt-4'}`}>
        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Calculator
        </span>
        <AppSelect
          value={calculatorOption(calculator)}
          onValueChange={(value) => onCalculatorChange(optionBoolean(value))}
          options={CALCULATOR_OPTIONS}
          placeholder="Choose calculator status"
        />
      </div>

      <div className={`${styles.orderSelect} ${expanded ? styles.expandedOrderSection : 'mt-4'}`}>
        <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Question order
        </span>
        <AppSelect
          value={orderingMode}
          onValueChange={(value) =>
            onOrderingModeChange(value as PracticeOrderingMode)
          }
          options={ORDER_OPTIONS}
          placeholder="Choose question order"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {selectedOrderOption?.description}
        </p>
      </div>
    </div>
  );
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
    subjectSlug: subject.slug,
    subjectName: subject.name,
    groupName,
    concept,
    courseIds,
    requestedCount: Math.max(1, Math.min(10, available || 10)),
  };
}

function PickerConceptButton({
  concept,
  label,
  selected,
  onToggle,
}: {
  concept: CatalogConcept;
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`${styles.conceptButton} ${
        selected ? styles.conceptButtonSelected : ''
      } flex w-full items-center gap-3 rounded-xl border p-3 text-left`}
    >
      <span
        className={`${styles.conceptIcon} flex size-8 shrink-0 items-center justify-center rounded-lg`}
      >
        {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm">{label}</strong>
        <small className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {concept.courses.map(practiceCourseLabel).join(', ')}
        </small>
      </span>
      <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
        {concept.courses.length} course
        {concept.courses.length === 1 ? '' : 's'}
      </span>
    </button>
  );
}

export function PracticeSetBuilderV4({
  catalog,
  userId,
  initialConfiguration,
  sharedSource,
}: {
  catalog: Catalog;
  userId: string;
  initialConfiguration?: PracticeConfiguration | null;
  sharedSource?: SharedBuilderSource | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectionSearch, setSelectionSearch] = useState('');
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
  const [buildProgress, setBuildProgress] =
    useState<PracticeBuildProgress | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);
  const [stagedConceptIds, setStagedConceptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const previewRequest = useRef(0);
  const previewPending = useRef<{
    requestId: number;
    configuration: PracticeConfiguration;
    previewGroups: PracticePreviewGroupRequest[];
  } | null>(null);
  const previewInFlight = useRef<Promise<void> | null>(null);
  const pendingBuild = useRef<{
    requestId: string;
    configurationJson: string;
  } | null>(null);

  const totalRequested = useMemo(
    () => blocks.reduce((total, block) => total + block.requestedCount, 0),
    [blocks],
  );
  const selectedCourseCount = useMemo(
    () => blocks.reduce((total, block) => total + block.courseIds.length, 0),
    [blocks],
  );
  const availableCourseCount = useMemo(
    () =>
      blocks.reduce(
        (total, block) => total + block.concept.courses.length,
        0,
      ),
    [blocks],
  );
  const singletonConceptIds = useMemo(
    () => singletonPracticeConceptIds(catalog.subjects),
    [catalog],
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
              ...concept.courses.flatMap((course) => [
                course.name,
                course.level || '',
                course.syllabusLabel || '',
              ]),
            ].some((value) =>
              String(value).toLocaleLowerCase().includes(normalizedSearch),
            );
          }),
        }))
        .filter((group) => group.concepts.length),
    }))
    .filter((subject) => subject.groups.length);
  const filteredBlockGroups = useMemo(() => {
    const query = selectionSearch.trim().toLocaleLowerCase();
    const grouped = new Map<
      string,
      {
        subjectId: string;
        subjectSlug: string;
        subjectName: string;
        blocks: BuilderBlock[];
      }
    >();
    for (const block of blocks) {
      const searchable = [
        block.subjectName,
        block.groupName,
        block.concept.name,
        ...block.concept.courses.map((course) => course.name),
      ]
        .join(' ')
        .toLocaleLowerCase();
      if (query && !searchable.includes(query)) continue;
      const group = grouped.get(block.subjectId) || {
        subjectId: block.subjectId,
        subjectSlug: block.subjectSlug,
        subjectName: block.subjectName,
        blocks: [],
      };
      group.blocks.push(block);
      grouped.set(block.subjectId, group);
    }
    return [...grouped.values()];
  }, [blocks, selectionSearch]);

  const configuration = useMemo<PracticeConfiguration | null>(() => {
    const activeBlocks = blocks.filter((block) => block.requestedCount > 0);
    if (
      !blocks.length ||
      !activeBlocks.length ||
      blocks.some((block) => !block.courseIds.length)
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
      blocks: activeBlocks.map((block) => ({
        key: block.key,
        selectionType: 'concept' as const,
        conceptId: block.concept.id,
        conceptIds: block.concept.sourceConceptIds,
        courseIds: block.courseIds,
        requestedCount: block.requestedCount,
        filters: { ...filters },
      })),
    };
  }, [blocks, calculator, difficulties, orderingMode, saved, statuses]);

  const previewGroups = useMemo<PracticePreviewGroupRequest[]>(() => {
    if (!configuration) return [];
    const activeBlockKeys = new Set(configuration.blocks.map((block) => block.key));
    const grouped = new Map<string, string[]>();
    for (const block of blocks) {
      if (!activeBlockKeys.has(block.key)) continue;
      const blockKeys = grouped.get(block.subjectId) || [];
      blockKeys.push(block.key);
      grouped.set(block.subjectId, blockKeys);
    }
    return [...grouped].map(([key, blockKeys]) => ({ key, blockKeys }));
  }, [blocks, configuration]);

  const draft = useMemo<PracticeBuilderDraft>(
    () => ({
      schemaVersion: 1,
      orderingMode,
      filters: {
        difficulties:
          difficulties as PracticeConfiguration['filters']['difficulties'],
        statuses: statuses as PracticeConfiguration['filters']['statuses'],
        saved,
        calculator,
      },
      blocks: blocks.map((block) => ({
        key: block.key,
        conceptId: block.concept.id,
        courseIds: [...block.courseIds],
        requestedCount: block.requestedCount,
      })),
    }),
    [blocks, calculator, difficulties, orderingMode, saved, statuses],
  );

  const drainPreviewQueue = useCallback(() => {
    if (previewInFlight.current) return previewInFlight.current;

    const running = (async () => {
      while (previewPending.current) {
        const task = previewPending.current;
        previewPending.current = null;
        try {
          const response = await fetch(
            '/api/question-bank/practice-builder/preview',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                configuration: task.configuration,
                previewGroups: task.previewGroups,
              }),
            },
          );
          const payload = await readPracticeApiJson<{
            preview: PracticePreview;
          }>(response, 'Unable to preview this set.');
          if (previewRequest.current === task.requestId) {
            setPreview(payload.preview);
            setPreviewError('');
          }
        } catch (error) {
          if (previewRequest.current === task.requestId) {
            setPreviewError(
              error instanceof Error
                ? error.message
                : 'Unable to preview this set.',
            );
          }
        } finally {
          if (previewRequest.current === task.requestId) {
            setPreviewLoading(false);
          }
        }
      }
    })().finally(() => {
      previewInFlight.current = null;
    });

    previewInFlight.current = running;
    return running;
  }, []);

  useEffect(() => {
    if (!initialConfiguration) {
      const restored = readPracticeBuilderDraft(userId);
      if (restored) {
        setBlocks(draftBlocks(catalog, restored));
        setDifficulties(restored.filters.difficulties);
        setStatuses(restored.filters.statuses);
        setSaved(restored.filters.saved);
        setCalculator(restored.filters.calculator);
        setOrderingMode(restored.orderingMode);
      }
    }
    setDraftReady(true);
  }, [catalog, initialConfiguration, userId]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      savePracticeBuilderDraft(userId, draft);
    } catch {
      // Browser storage can be unavailable or full. The live builder remains usable.
    }
  }, [draft, draftReady, userId]);

  useEffect(() => {
    if (!settingsExpanded && !contentPickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (contentPickerOpen) setContentPickerOpen(false);
      else setSettingsExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contentPickerOpen, settingsExpanded]);

  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    previewPending.current = null;

    if (!draftReady || !configuration || isMaximizing) {
      setPreviewLoading(false);
      return;
    }

    const debounce = window.setTimeout(() => {
      setPreviewLoading(true);
      previewPending.current = { requestId, configuration, previewGroups };
      void drainPreviewQueue();
    }, 500);

    return () => {
      window.clearTimeout(debounce);
    };
  }, [configuration, draftReady, drainPreviewQueue, isMaximizing, previewGroups]);


  function updateBlock(key: string, patch: Partial<BuilderBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  }

  function openContentPicker() {
    setSearch('');
    setStagedConceptIds(new Set(blocks.map((block) => block.concept.id)));
    setContentPickerOpen(true);
  }

  function toggleStagedConcept(conceptId: string) {
    setStagedConceptIds((current) => {
      const next = new Set(current);
      if (next.has(conceptId)) next.delete(conceptId);
      else next.add(conceptId);
      return next;
    });
  }

  function selectStagedSubject(subject: CatalogSubject) {
    setStagedConceptIds((current) => {
      const next = new Set(current);
      for (const group of subject.groups)
        for (const concept of group.concepts) next.add(concept.id);
      return next;
    });
  }

  function clearStagedSubject(subject: CatalogSubject) {
    setStagedConceptIds((current) => {
      const next = new Set(current);
      for (const group of subject.groups)
        for (const concept of group.concepts) next.delete(concept.id);
      return next;
    });
  }

  function selectStagedGroup(group: CatalogSubject['groups'][number]) {
    setStagedConceptIds((current) => {
      const next = new Set(current);
      for (const concept of group.concepts) next.add(concept.id);
      return next;
    });
  }

  function clearStagedGroup(group: CatalogSubject['groups'][number]) {
    setStagedConceptIds((current) => {
      const next = new Set(current);
      for (const concept of group.concepts) next.delete(concept.id);
      return next;
    });
  }

  function saveContentSelection() {
    const keptBlocks = blocks.filter((block) =>
      stagedConceptIds.has(block.concept.id),
    );
    const existingIds = new Set(
      keptBlocks.map((block) => block.concept.id),
    );
    const additions: BuilderBlock[] = [];
    for (const subject of catalog.subjects) {
      for (const group of subject.groups) {
        for (const concept of group.concepts) {
          if (
            stagedConceptIds.has(concept.id) &&
            !existingIds.has(concept.id)
          ) {
            additions.push(makeBlock(subject, group.name, concept));
            existingIds.add(concept.id);
          }
        }
      }
    }
    setBlocks([...keptBlocks, ...additions]);
    setContentPickerOpen(false);
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
    previewRequest.current += 1;
    previewPending.current = null;
    setIsMaximizing(true);
    setPreviewLoading(false);

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
          conceptIds: block.concept.sourceConceptIds,
          courseIds: [...block.courseIds],
          requestedCount: Math.max(1, block.requestedCount),
          filters: { ...filters },
        })),
      };
    }

    async function requestMaximum(nextConfiguration: PracticeConfiguration) {
      await previewInFlight.current;
      const response = await fetch('/api/question-bank/practice-builder/maximize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration: nextConfiguration }),
      });
      const payload = await readPracticeApiJson<{
        maximum: PracticeMaximumPreview;
      }>(response, 'Unable to calculate the maximum.');
      return payload.maximum;
    }

    try {
      const workingBlocks = blocks.map((block) =>
        block.courseIds.length
          ? { ...block, requestedCount: Math.max(1, block.requestedCount) }
          : {
              ...block,
              courseIds: block.concept.courses.map((course) => course.id),
              requestedCount: Math.max(1, block.requestedCount),
            },
      );
      const maximum = await requestMaximum(configurationFor(workingBlocks));
      const skippedKeys = new Set(
        maximum.blocks
          .filter(
            (result) =>
              result.candidateCount < 1 || result.recommendedCount < 1,
          )
          .map((result) => result.key),
      );

      if (skippedKeys.size === workingBlocks.length)
        throw new Error('No questions match the selected courses and filters.');

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
          ' unique questions across the selected subtopics.' +
          (skippedKeys.size
            ? ` ${skippedKeys.size} subtopic${skippedKeys.size === 1 ? '' : 's'} with no matching unique question${skippedKeys.size === 1 ? ' was' : 's were'} left at zero and skipped for this session.`
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
    const configurationJson = JSON.stringify(configuration);
    if (pendingBuild.current?.configurationJson !== configurationJson) {
      pendingBuild.current = {
        requestId: crypto.randomUUID(),
        configurationJson,
      };
    }
    setIsStarting(true);
    setBuildProgress({
      phase: 'selecting',
      label: 'Selecting and ordering questions…',
      processedCount: null,
      totalCount: null,
    });
    try {
      const response = await fetch('/api/question-bank/practice-builder/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          configuration,
          requestId: pendingBuild.current.requestId,
        }),
      });
      const payload = await readPracticeBuildStream(
        response,
        setBuildProgress,
      );
      pendingBuild.current = null;
      toast.success('Your practice session is ready.');
      router.push(`/question-bank/practice/${payload.sessionId}`);
    } catch (error) {
      setIsStarting(false);
      setBuildProgress(null);
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

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${styles.selectionPanel} rounded-2xl border p-4 shadow-sm xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden`}>
          <div className={`${styles.selectionViewport} xl:flex xl:min-h-0 xl:flex-1 xl:flex-col`}>
          <div className="shrink-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                1 · Configure selections
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
                Your selected content
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Add the subjects and subtopics you need, then give every subtopic its
                own courses and question amount.
              </p>
            </div>

            <div className={`${styles.addContentBar} mt-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="flex items-start gap-3">
                <span className={`${styles.addContentIcon} flex size-10 shrink-0 items-center justify-center rounded-xl`}>
                  <Plus className="size-5" />
                </span>
                <div>
                  <strong className="block text-sm text-slate-900 dark:text-white">
                    Choose subjects and subtopics
                  </strong>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Search all courses, select complete subjects, or change your
                    {blocks.length
                      ? ` ${blocks.length.toLocaleString()} current subtopic${blocks.length === 1 ? '' : 's'}.`
                      : ' content before configuring it.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={openContentPicker}
                className={`${styles.primaryAction} inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold`}
              >
                <Plus className="size-4" />
                Add subjects or subtopics
              </button>
            </div>

            {blocks.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={blocks.every(
                    (block) =>
                      block.courseIds.length === block.concept.courses.length,
                  )}
                  onClick={useAllCoursesForAllBlocks}
                  className={`${styles.courseBulkButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
                >
                  <CheckSquare2 className="size-4" />
                  Use all courses
                </button>
                <button
                  type="button"
                  disabled={isMaximizing}
                  onClick={() => void maximizeAll()}
                  className={`${styles.maxBulkButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
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

          {blocks.length ? (
            <label
              className={`${styles.searchShell} mt-4 flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2`}
            >
              <Search className="size-4 text-slate-500" />
              <span className="sr-only">Find a selected subtopic or course</span>
              <input
                value={selectionSearch}
                onChange={(event) => setSelectionSearch(event.target.value)}
                placeholder={`Find among ${blocks.length.toLocaleString()} selected subtopics`}
                className={`${styles.searchInput} min-w-0 flex-1 border-0 bg-transparent text-sm outline-none`}
              />
            </label>
          ) : null}

          <div className="mt-4 space-y-3 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {filteredBlockGroups.map((subjectGroup) => {
              const subjectRequested = subjectGroup.blocks.reduce(
                (total, block) => total + block.requestedCount,
                0,
              );
              const subjectCoursesSelected = subjectGroup.blocks.reduce(
                (total, block) => total + block.courseIds.length,
                0,
              );
              const subjectCoursesAvailable = subjectGroup.blocks.reduce(
                (total, block) => total + block.concept.courses.length,
                0,
              );
              const subjectPreviewBlocks = subjectGroup.blocks
                .map((block) =>
                  preview?.blocks.find((row) => row.key === block.key),
                )
                .filter((row): row is PracticePreviewBlock => Boolean(row));
              const subjectPreview = preview?.groups.find(
                (group) => group.key === subjectGroup.subjectId,
              );
              return (
                <details
                  key={`${subjectGroup.subjectId}:${selectionSearch ? 'filtered' : 'all'}`}
                  open={blocks.length <= 12 || Boolean(selectionSearch) || undefined}
                  className={`${styles.selectedSubjectGroup} rounded-2xl border`}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className={`${styles.detailsChevron} size-4 shrink-0`} />
                    <SubjectIcon subjectSlug={subjectGroup.subjectSlug} compact />
                    <strong className="min-w-0 flex-1 text-sm text-slate-900 dark:text-slate-50">
                      {subjectGroup.subjectName}
                    </strong>
                    <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-right text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {subjectGroup.blocks.length} subtopic
                        {subjectGroup.blocks.length === 1 ? '' : 's'}
                      </span>
                      <span>
                        {subjectCoursesSelected.toLocaleString()}/
                        {subjectCoursesAvailable.toLocaleString()} courses
                      </span>
                      <span>
                        {subjectPreview
                          ? `${subjectPreview.allocatedCount.toLocaleString()}/${subjectPreview.totalUniqueAvailable.toLocaleString()} eligible questions selected`
                          : `${subjectRequested.toLocaleString()} questions selected`}
                      </span>
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-2 dark:border-slate-800">
                    {subjectGroup.blocks.map((block) => {
                      const blockIndex = blocks.indexOf(block);
                      const blockPreview = preview?.blocks.find(
                        (row) => row.key === block.key,
                      );
                      const maximum = maximumForBlock(block, blockPreview);
                      const allCoursesSelected =
                        block.courseIds.length === block.concept.courses.length;
                      const selectedCourses = block.concept.courses.filter((course) =>
                        block.courseIds.includes(course.id),
                      );
                      const courseSummary = selectedCourses
                        .map(practiceCourseLabel)
                        .join(', ');
                      const isOnlySubtopic = singletonConceptIds.has(
                        block.concept.id,
                      );
                      const selectionLabel = practiceSelectionLabel(
                        block.groupName,
                        block.concept.name,
                        isOnlySubtopic,
                      );
                      return (
                        <article
                          key={block.key}
                          className={`${styles.selectedTopicRow} flex items-start gap-1 rounded-xl border`}
                        >
                          <details
                            open={blocks.length <= 6 || Boolean(selectionSearch) || undefined}
                            className="min-w-0 flex-1"
                          >
                            <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--dp-navy)] text-xs font-semibold text-white">
                                {blockIndex + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                {!isOnlySubtopic ? (
                                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {block.groupName}
                                  </span>
                                ) : null}
                                <strong className="mt-0.5 block text-sm text-slate-900 dark:text-slate-50">
                                  {selectionLabel}
                                </strong>
                                <small className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                                  {courseSummary || 'No course selected'}
                                </small>
                              </span>
                              <span className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1">
                                <span className={`${styles.courseCountPill} rounded-full px-2.5 py-1 text-[0.7rem] font-semibold`}>
                                  {block.courseIds.length.toLocaleString()}/
                                  {block.concept.courses.length.toLocaleString()} courses selected
                                </span>
                                <span className={`${styles.questionCountPill} rounded-full px-2.5 py-1 text-[0.7rem] font-semibold`}>
                                  {blockPreview
                                    ? `${blockPreview.allocatedCount.toLocaleString()}/${blockPreview.candidateCount.toLocaleString()} eligible questions selected`
                                    : `${block.requestedCount.toLocaleString()} questions selected`}
                                </span>
                              </span>
                              <ChevronDown
                                className={`${styles.detailsChevron} size-4 shrink-0 text-slate-400`}
                              />
                            </summary>

                            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                              <fieldset>
                                <div className="flex items-center justify-between gap-3">
                                  <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    Courses for this subtopic
                                  </legend>
                                  <button
                                    type="button"
                                    disabled={allCoursesSelected}
                                    onClick={() => useAllCourses(block)}
                                    className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                                  >
                                    {allCoursesSelected
                                      ? 'All courses selected'
                                      : 'Use all courses'}
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
                                        <span className="min-w-0">
                                          <strong className="block text-sm text-slate-800 dark:text-slate-100">
                                            {course.name}
                                          </strong>
                                          <small className="block text-xs text-slate-500 dark:text-slate-400">
                                            {course.syllabusLabel || course.level || 'Course'}{' '}
                                            · {course.questionCount.toLocaleString()} unique
                                            available
                                          </small>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                                {!block.courseIds.length ? (
                                  <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
                                    Select at least one course for this subtopic.
                                  </p>
                                ) : null}
                              </fieldset>

                              <div className="mt-4">
                                <div className="flex items-end justify-between gap-3">
                                  <label className="block max-w-48 flex-1">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                      Questions from this subtopic
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
                                      aria-label={`Questions from ${selectionLabel}`}
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
                                      disabled={
                                        maximum === 0 || block.requestedCount >= maximum
                                      }
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
                                    disabled={
                                      maximum === 0 || block.requestedCount >= maximum
                                    }
                                    onClick={() =>
                                      setRequestedCount(block, maximum, blockPreview)
                                    }
                                    className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                                  >
                                    Max subtopic
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
                                  {blockPreview.candidateCount.toLocaleString()} unique
                                  candidates ·{' '}
                                  {blockPreview.shortage
                                    ? `${blockPreview.requestedCount.toLocaleString()} requested · short by ${blockPreview.shortage.toLocaleString()}`
                                    : `${blockPreview.allocatedCount.toLocaleString()} allocated`}
                                  {blockPreview.overlapQuestionCount
                                    ? ` · ${blockPreview.overlapQuestionCount.toLocaleString()} also match another selection`
                                    : ''}
                                </div>
                              ) : block.requestedCount === 0 ? (
                                <div
                                  className={`${styles.previewWarning} mt-4 rounded-xl px-3 py-2 text-sm`}
                                >
                                  No questions match the current courses and filters.
                                  This subtopic stays selected and is skipped until the
                                  settings match an eligible question.
                                </div>
                              ) : null}
                            </div>
                          </details>
                          <button
                            type="button"
                            onClick={() =>
                              setBlocks((current) =>
                                current.filter((item) => item.key !== block.key),
                              )
                            }
                            className={`${styles.deleteButton} mr-2 mt-2 shrink-0 rounded-lg p-2`}
                            aria-label={`Remove ${selectionLabel}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })}

            {blocks.length && !filteredBlockGroups.length ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                No selected subtopic or course matches that search.
              </p>
            ) : null}

            {!blocks.length ? (
              <div className={`${styles.emptySelection} rounded-2xl border border-dashed p-8 text-center`}>
                <span className={`${styles.addContentIcon} mx-auto flex size-12 items-center justify-center rounded-2xl`}>
                  <BookOpenCheck className="size-6" />
                </span>
                <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  Add your first subtopic
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Select one subtopic, a whole subject, or a mixture of subjects.
                </p>
                <button
                  type="button"
                  onClick={openContentPicker}
                  className={`${styles.primaryAction} mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold`}
                >
                  <Plus className="size-4" />
                  Add subjects or subtopics
                </button>
              </div>
            ) : null}
          </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className={`${styles.settingsCard} rounded-2xl border shadow-sm`}>
            <div className={`${styles.settingsHeader} flex items-start justify-between gap-3 border-b p-4`}>
              <div className="flex items-start gap-3">
                <span className={`${styles.settingsIcon} flex size-10 shrink-0 items-center justify-center rounded-xl`}>
                  <SlidersHorizontal className="size-5" />
                </span>
                <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                  2 · Session settings
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[color:var(--dp-navy)]">
                  Mix and filters
                </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsExpanded(true)}
                className={`${styles.countButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
                aria-label="Expand session settings"
              >
                <Maximize2 className="size-4" />
                Expand
              </button>
            </div>
            <div className={`${styles.settingsPanel} p-4`}>
              <PracticeSettingsFields
                difficulties={difficulties}
                statuses={statuses}
                saved={saved}
                calculator={calculator}
                orderingMode={orderingMode}
                onToggleDifficulty={(value) =>
                  toggleListValue(value, difficulties, setDifficulties)
                }
                onToggleStatus={(value) =>
                  toggleListValue(value, statuses, setStatuses)
                }
                onSavedChange={setSaved}
                onCalculatorChange={setCalculator}
                onOrderingModeChange={setOrderingMode}
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
                <dt className="text-blue-100">Eligible selected</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {preview
                    ? `${preview.allocatedCount.toLocaleString()}/${preview.totalUniqueAvailable.toLocaleString()}`
                    : `${totalRequested.toLocaleString()}/—`}
                </dd>
              </div>
              <div>
                <dt className="text-blue-100">Course choices</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {selectedCourseCount.toLocaleString()}/
                  {availableCourseCount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-blue-100">Subjects</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {new Set(blocks.map((block) => block.subjectName)).size}
                </dd>
              </div>
              <div>
                <dt className="text-blue-100">Topics</dt>
                <dd className="mt-0.5 text-xl font-semibold">{blocks.length}</dd>
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
            {isStarting && buildProgress ? (
              <div
                className={`${styles.buildProgressPanel} mt-4 rounded-xl px-3 py-3`}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-white">
                    {buildProgress.label}
                  </span>
                  <span className="shrink-0 font-semibold text-blue-100">
                    {buildProgress.totalCount === null
                      ? 'Preparing'
                      : `${Math.round(
                          ((buildProgress.processedCount || 0) /
                            buildProgress.totalCount) *
                            100,
                        )}%`}
                  </span>
                </div>
                <div
                  className={`${styles.buildProgressTrack} mt-2 h-2 overflow-hidden rounded-full`}
                  role={
                    buildProgress.totalCount === null ? undefined : 'progressbar'
                  }
                  aria-label="Practice session preparation progress"
                  aria-valuemin={
                    buildProgress.totalCount === null ? undefined : 0
                  }
                  aria-valuemax={
                    buildProgress.totalCount === null ? undefined : 100
                  }
                  aria-valuenow={
                    buildProgress.totalCount === null
                      ? undefined
                      : Math.round(
                          ((buildProgress.processedCount || 0) /
                            buildProgress.totalCount) *
                            100,
                        )
                  }
                >
                  <div
                    className={`${styles.buildProgressBar} h-full rounded-full transition-[width] duration-150 ${
                      buildProgress.totalCount === null
                        ? 'w-2/5 animate-pulse'
                        : ''
                    }`}
                    style={
                      buildProgress.totalCount === null
                        ? undefined
                        : {
                            width: `${Math.round(
                              ((buildProgress.processedCount || 0) /
                                buildProgress.totalCount) *
                                100,
                            )}%`,
                          }
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-blue-100">
                  {buildProgress.totalCount === null
                    ? 'Checking the complete eligible pool before saving.'
                    : `${(
                        buildProgress.processedCount || 0
                      ).toLocaleString()} of ${buildProgress.totalCount.toLocaleString()} questions saved`}
                </p>
              </div>
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

      {contentPickerOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContentPickerOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-content-picker-title"
            className={`${styles.contentPickerDialog} flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]`}
          >
            <header className={`${styles.contentPickerHeader} flex shrink-0 items-start justify-between gap-4 border-b p-5 sm:p-6`}>
              <div className="flex items-start gap-3">
                <span className={`${styles.addContentIcon} flex size-11 shrink-0 items-center justify-center rounded-xl`}>
                  <Plus className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                    Add content
                  </p>
                  <h2
                    id="practice-content-picker-title"
                    className="mt-1 text-2xl font-semibold text-[color:var(--dp-navy)]"
                  >
                    Choose subjects and subtopics
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Your existing course choices and question amounts are preserved
                    for every subtopic you keep selected.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContentPickerOpen(false)}
                className={`${styles.countButton} inline-flex size-10 shrink-0 items-center justify-center rounded-xl border`}
                aria-label="Close content picker"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className={`${styles.contentPickerToolbar} shrink-0 border-b px-5 py-4 sm:px-6`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  className={`${styles.searchShell} flex min-h-11 flex-1 items-center gap-2 rounded-xl border px-3 py-2`}
                >
                  <Search className="size-4 text-slate-500" />
                  <span className="sr-only">Search subjects, larger topics, subtopics, or courses</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search subjects, larger topics, subtopics, or courses"
                    className={`${styles.searchInput} min-w-0 flex-1 border-0 bg-transparent text-sm outline-none`}
                    autoFocus
                  />
                </label>
                <span className={`${styles.selectionCounter} inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold`}>
                  {stagedConceptIds.size.toLocaleString()} subtopics selected
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {filteredSubjects.map((subject) => {
                const fullSubject =
                  catalog.subjects.find(
                    (candidate) => candidate.id === subject.id,
                  ) || subject;
                const concepts = fullSubject.groups.flatMap(
                  (group) => group.concepts,
                );
                const selectedInSubject = concepts.filter((concept) =>
                  stagedConceptIds.has(concept.id),
                ).length;
                const allSelected = selectedInSubject === concepts.length;
                return (
                  <details
                    key={subject.id}
                    open={Boolean(search) || undefined}
                    className={`${styles.pickerSubject} rounded-2xl border`}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                      <ChevronDown className={`${styles.detailsChevron} size-4 shrink-0`} />
                      <SubjectIcon subjectSlug={subject.slug} compact />
                      <strong className="min-w-0 flex-1 text-sm text-slate-900 dark:text-slate-50">
                        {subject.name}
                      </strong>
                      <span className={`${styles.selectionCounter} rounded-full px-2.5 py-1 text-xs font-semibold`}>
                        {selectedInSubject.toLocaleString()}/{concepts.length.toLocaleString()} subtopics
                      </span>
                    </summary>
                    <div className="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={allSelected}
                          onClick={() => selectStagedSubject(fullSubject)}
                          className={`${styles.courseBulkButton} inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold`}
                        >
                          <CheckSquare2 className="size-4" />
                          {allSelected ? 'All subtopics selected' : 'Select all subtopics'}
                        </button>
                        {selectedInSubject ? (
                          <button
                            type="button"
                            onClick={() => clearStagedSubject(fullSubject)}
                            className={`${styles.deleteButton} rounded-lg px-3 py-2 text-xs font-semibold`}
                          >
                            Clear this subject
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        {subject.groups.map((group) => {
                          const fullGroup =
                            fullSubject.groups.find(
                              (candidate) => candidate.id === group.id,
                            ) || group;
                          const selectedInGroup = fullGroup.concepts.filter(
                            (concept) => stagedConceptIds.has(concept.id),
                          ).length;
                          const groupSelected =
                            selectedInGroup === fullGroup.concepts.length;
                          const isOnlySubtopic =
                            fullGroup.concepts.length === 1;
                          const onlySubtopic = group.concepts[0];

                          if (isOnlySubtopic && onlySubtopic) {
                            return (
                              <PickerConceptButton
                                key={group.id}
                                concept={onlySubtopic}
                                label={practiceSelectionLabel(
                                  fullGroup.name,
                                  onlySubtopic.name,
                                  true,
                                )}
                                selected={stagedConceptIds.has(onlySubtopic.id)}
                                onToggle={() =>
                                  toggleStagedConcept(onlySubtopic.id)
                                }
                              />
                            );
                          }

                          return (
                            <section key={group.id} className="md:col-span-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {group.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <span className={`${styles.selectionCounter} rounded-full px-2.5 py-1 text-xs font-semibold`}>
                                    {selectedInGroup.toLocaleString()}/
                                    {fullGroup.concepts.length.toLocaleString()} subtopics
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      groupSelected
                                        ? clearStagedGroup(fullGroup)
                                        : selectStagedGroup(fullGroup)
                                    }
                                    className={`${styles.courseBulkButton} rounded-lg border px-2.5 py-1.5 text-xs font-semibold`}
                                  >
                                    {groupSelected ? 'Clear' : 'Select all'}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 grid gap-2 md:grid-cols-2">
                                {group.concepts.map((concept) => (
                                  <PickerConceptButton
                                    key={concept.id}
                                    concept={concept}
                                    label={concept.name}
                                    selected={stagedConceptIds.has(concept.id)}
                                    onToggle={() =>
                                      toggleStagedConcept(concept.id)
                                    }
                                  />
                                ))}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
              {!filteredSubjects.length ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  No subjects, larger topics, subtopics, or courses match that search.
                </p>
              ) : null}
            </div>

            <footer className={`${styles.contentPickerFooter} flex shrink-0 flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6`}>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Changes are applied only when you save.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContentPickerOpen(false)}
                  className={`${styles.countButton} min-h-11 flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold sm:flex-none`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveContentSelection}
                  className={`${styles.primaryAction} inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:flex-none`}
                >
                  <Save className="size-4" />
                  Save content selection
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {settingsExpanded ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsExpanded(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-settings-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                  Session settings
                </p>
                <h2
                  id="practice-settings-title"
                  className="mt-1 text-2xl font-semibold text-[color:var(--dp-navy)]"
                >
                  Mix and filters
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Every filter and ordering option is visible here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsExpanded(false)}
                className={`${styles.countButton} inline-flex size-10 shrink-0 items-center justify-center rounded-xl border`}
                aria-label="Close expanded session settings"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="p-5 sm:p-6">
              <PracticeSettingsFields
                expanded
                difficulties={difficulties}
                statuses={statuses}
                saved={saved}
                calculator={calculator}
                orderingMode={orderingMode}
                onToggleDifficulty={(value) =>
                  toggleListValue(value, difficulties, setDifficulties)
                }
                onToggleStatus={(value) =>
                  toggleListValue(value, statuses, setStatuses)
                }
                onSavedChange={setSaved}
                onCalculatorChange={setCalculator}
                onOrderingModeChange={setOrderingMode}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
