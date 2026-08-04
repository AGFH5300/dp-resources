'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  ExternalLink,
  FileText,
  Lightbulb,
  Loader2,
  PlayCircle,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { QuestionContent } from '@/components/question-bank/question-content';
import { QuestionStateControls } from '@/components/question-bank/question-state-controls';
import { SolutionVideo } from '@/components/question-bank/solution-video';
import { ReportResourceDialog } from '@/components/resource-actions';
import { questionPreview } from '@/lib/question-bank/content-normalization';
import { hasSubstantiveExaminerReport } from '@/lib/question-bank/examiner-report';
import {
  isCorrectSelection,
  parseInteractiveQuestion,
} from '@/lib/question-bank/interactive';
import {
  clearAllPracticeAttempts,
  clearPracticeAttempt,
  readPracticeAttempt,
  savePracticeAttempt,
} from '@/lib/question-bank/practice-attempt-storage';
import { marksLabel, taxonomyLabel } from '@/lib/question-bank/presentation';
import type {
  QuestionAsset,
  QuestionListRow,
  QuestionProgressStatus,
} from '@/lib/question-bank/types';

const QUESTION_REPORT_CATEGORIES = [
  'Broken image or diagram',
  'Broken audio or transcript',
  'Broken solution video',
  'Wrong answer or markscheme',
  'Question text or layout problem',
  'Wrong topic or metadata',
  'Duplicate question',
  'Other',
] as const;

function difficultyClass(value: string | null) {
  const difficulty = String(value || '').toLowerCase();
  return `dp-qb-difficulty dp-qb-difficulty-${
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? difficulty
      : 'unrated'
  }`;
}

function isAudioAsset(asset: QuestionAsset) {
  return (
    asset.originalRole === 'audio' ||
    String(asset.contentType || '').toLowerCase().startsWith('audio/')
  );
}

function sanitizeQuestionAsset(asset: QuestionAsset): QuestionAsset {
  if (!isAudioAsset(asset)) return asset;
  return {
    ...asset,
    altText: 'Question audio',
  };
}

type QuestionDetail = {
  variant: {
    id: string;
    difficultyLabel: string | null;
    section: string | null;
    calculatorAllowed: boolean | null;
    topicName: string;
    subtopicNames: string[];
    paperReference: string | null;
    formulaBookletUrl: string | null;
  };
  question: {
    id: string;
    reference: string;
    content: string;
    markScheme: string;
    examinerReport: string;
    maximumMark: number;
  };
  assets: QuestionAsset[];
  videos: Array<{ id: string; name: string | null; url: string }>;
  progress: { status: QuestionProgressStatus };
  saved: boolean;
};

async function updateQuestionState(
  detail: QuestionDetail,
  payload: Record<string, unknown>,
) {
  const response = await fetch('/api/question-bank/state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      questionId: detail.question.id,
      variantId: detail.variant.id,
      ...payload,
    }),
  });
  if (!response.ok) throw new Error('Unable to update question state.');
}

function answerList(ids: string[]) {
  if (ids.length <= 1) return ids[0] || '';
  if (ids.length === 2) return `${ids[0]} and ${ids[1]}`;
  return `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`;
}

export function CoursePracticeWorkspace({
  questions,
  total,
  currentPage,
  pages,
  previousHref,
  nextHref,
  initialVariantId,
  coursePath,
}: {
  questions: QuestionListRow[];
  total: number;
  currentPage: number;
  pages: number;
  previousHref: string | null;
  nextHref: string | null;
  initialVariantId: string | null;
  coursePath: string;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId,
  );
  const [questionRows, setQuestionRows] = useState(questions);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChoiceIdsBySection, setSelectedChoiceIdsBySection] = useState<
    Record<string, string[]>
  >({});
  const [checkedSectionIds, setCheckedSectionIds] = useState<string[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const selectedIndex = questionRows.findIndex(
    (question) => question.variant_id === selectedVariantId,
  );
  const interactive = useMemo(
    () =>
      detail
        ? parseInteractiveQuestion(
            detail.question.content,
            detail.question.markScheme,
            detail.question.maximumMark,
          )
        : null,
    [detail],
  );

  useEffect(() => setQuestionRows(questions), [questions]);
  useEffect(() => setSelectedVariantId(initialVariantId), [initialVariantId]);

  useEffect(() => {
    if (!selectedVariantId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedChoiceIdsBySection({});
    setCheckedSectionIds([]);
    setShowExplanation(false);
    fetch(`/api/question-bank/questions/${selectedVariantId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load this question.');
        return (await response.json()) as QuestionDetail;
      })
      .then((payload) => {
        const parsed = parseInteractiveQuestion(
          payload.question.content,
          payload.question.markScheme,
          payload.question.maximumMark,
        );
        const savedAttempt = readPracticeAttempt(payload.variant.id);
        const restoredSelections: Record<string, string[]> = {};
        const restoredChecked: string[] = [];
        for (const [sectionIndex, section] of parsed.sections.entries()) {
          const validIds = new Set(section.choices.map((choice) => choice.id));
          const savedChoices = (
            savedAttempt?.selectedChoiceIdsBySection?.[section.id] ||
            (sectionIndex === 0 ? savedAttempt?.selectedChoiceIds || [] : [])
          ).filter((id) => validIds.has(id));
          if (savedChoices.length <= section.requiredSelectionCount)
            restoredSelections[section.id] = savedChoices;
          const wasChecked =
            savedAttempt?.checkedSectionIds?.includes(section.id) ||
            (sectionIndex === 0 && savedAttempt?.answerChecked);
          if (wasChecked && savedChoices.length === section.requiredSelectionCount)
            restoredChecked.push(section.id);
        }
        setSelectedChoiceIdsBySection(restoredSelections);
        setCheckedSectionIds(restoredChecked);
        setShowExplanation(Boolean(savedAttempt?.showExplanation));
        setDetail(payload);
        requestAnimationFrame(() => panelRef.current?.focus());
      })
      .catch((reason) => {
        if (reason?.name !== 'AbortError')
          setError('This question could not be loaded. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedVariantId]);

  function syncQuestionToUrl(variantId: string | null) {
    const url = new URL(window.location.href);
    if (variantId) url.searchParams.set('question', variantId);
    else url.searchParams.delete('question');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event('dp-question-change'));
  }

  function applyQuestionState(
    variantId: string,
    state: { status?: QuestionProgressStatus; saved?: boolean },
  ) {
    setQuestionRows((rows) =>
      rows.map((row) =>
        row.variant_id === variantId
          ? {
              ...row,
              progress_status: state.status ?? row.progress_status,
              is_saved: state.saved ?? row.is_saved,
            }
          : row,
      ),
    );
    setDetail((current) =>
      current && current.variant.id === variantId
        ? {
            ...current,
            progress: {
              status: state.status ?? current.progress.status,
            },
            saved: state.saved ?? current.saved,
          }
        : current,
    );
  }

  function openQuestion(variantId: string) {
    setSelectedVariantId(variantId);
    syncQuestionToUrl(variantId);
  }

  function closeQuestion() {
    setSelectedVariantId(null);
    syncQuestionToUrl(null);
  }

  function persistAttempt(
    selections = selectedChoiceIdsBySection,
    checked = checkedSectionIds,
    explanation = showExplanation,
  ) {
    if (!detail) return;
    const firstSectionId = interactive?.sections[0]?.id;
    savePracticeAttempt(detail.variant.id, {
      selectedChoiceIdsBySection: selections,
      checkedSectionIds: checked,
      selectedChoiceIds: firstSectionId ? selections[firstSectionId] || [] : [],
      answerChecked: checked.length > 0,
      showExplanation: explanation,
    });
  }

  function toggleChoice(sectionId: string, choiceId: string) {
    if (!detail || !interactive || checkedSectionIds.includes(sectionId)) return;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const current = selectedChoiceIdsBySection[sectionId] || [];
    let next: string[];
    if (section.selectionMode === 'single') {
      next = [choiceId];
    } else {
      const selected = current.includes(choiceId);
      if (selected) next = current.filter((id) => id !== choiceId);
      else if (current.length < section.requiredSelectionCount)
        next = [...current, choiceId];
      else {
        toast.info(
          `Select exactly ${section.requiredSelectionCount} answers. Deselect one before choosing another.`,
        );
        return;
      }
    }
    const selections = { ...selectedChoiceIdsBySection, [sectionId]: next };
    setSelectedChoiceIdsBySection(selections);
    if (section.selectionMode === 'single') {
      void checkSection(section.id, selections);
      return;
    }
    persistAttempt(selections, checkedSectionIds, false);
  }

  async function checkSection(
    sectionId: string,
    selections = selectedChoiceIdsBySection,
  ) {
    if (!detail || !interactive || checkedSectionIds.includes(sectionId)) return;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const selected = selections[sectionId] || [];
    if (selected.length !== section.requiredSelectionCount) {
      toast.error(
        section.requiredSelectionCount === 1
          ? 'Select one answer before checking.'
          : `Select exactly ${section.requiredSelectionCount} answers before checking.`,
      );
      return;
    }
    const checked = [...checkedSectionIds, sectionId];
    const allChecked = interactive.sections.every((item) => checked.includes(item.id));
    setCheckedSectionIds(checked);
    if (allChecked) setShowExplanation(true);
    persistAttempt(selections, checked, allChecked || showExplanation);

    if (allChecked && !interactive.isPartialInteraction) {
      const previousStatus = detail.progress.status;
      applyQuestionState(detail.variant.id, { status: 'completed' });
      try {
        await updateQuestionState(detail, { status: 'completed' });
      } catch {
        applyQuestionState(detail.variant.id, { status: previousStatus });
        toast.error('Your answers were checked, but progress could not be saved.');
      }
    }
  }

  function revealExplanation() {
    if (!detail) return;
    setShowExplanation(true);
    persistAttempt(selectedChoiceIdsBySection, checkedSectionIds, true);
  }

  function resetCurrentAttempt() {
    if (!detail) return;
    clearPracticeAttempt(detail.variant.id);
    setSelectedChoiceIdsBySection({});
    setCheckedSectionIds([]);
    setShowExplanation(false);
    toast.success('This answer was reset on this device.');
  }

  function resetEveryAttempt() {
    const confirmed = window.confirm(
      'Reset every locally saved Question Bank answer on this device? Saved questions and progress statuses will not be changed.',
    );
    if (!confirmed) return;
    clearAllPracticeAttempts();
    setSelectedChoiceIdsBySection({});
    setCheckedSectionIds([]);
    setShowExplanation(false);
    toast.success('All locally saved answers were reset.');
  }

  async function selfAssess(gotIt: boolean) {
    if (!detail) return;
    const previous = { status: detail.progress.status };
    const next = gotIt
      ? { status: 'completed' as const }
      : { status: 'in_progress' as const };
    applyQuestionState(detail.variant.id, next);
    try {
      await updateQuestionState(detail, next);
      toast.success(gotIt ? 'Marked as completed.' : 'Marked as in progress.');
    } catch {
      applyQuestionState(detail.variant.id, previous);
      toast.error('Could not save your progress.');
    }
  }

  const questionAssets = (detail?.assets || [])
    .filter((asset) => asset.role === 'question' || asset.role === 'content_reference')
    .map(sanitizeQuestionAsset);
  const nonAudioQuestionAssets = questionAssets.filter((asset) => !isAudioAsset(asset));
  const markschemeAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'markscheme',
  );
  const examinerReportAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'examiner_report',
  );
  const hasExaminerReport = hasSubstantiveExaminerReport(
    detail?.question.examinerReport,
  );
  const allInteractiveChecked = Boolean(
    interactive?.sections.length &&
      interactive.sections.every((section) => checkedSectionIds.includes(section.id)),
  );
  const allInteractiveCorrect = Boolean(
    allInteractiveChecked &&
      interactive?.sections.every((section) =>
        isCorrectSelection(
          selectedChoiceIdsBySection[section.id] || [],
          section.correctChoiceIds,
        ),
      ),
  );
  const hasCurrentAttempt = Boolean(
    Object.values(selectedChoiceIdsBySection).some((choices) => choices.length) ||
      checkedSectionIds.length ||
      showExplanation,
  );

  function renderChoiceSection(sectionId: string) {
    if (!interactive) return null;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return null;
    const selectedChoiceIds = selectedChoiceIdsBySection[section.id] || [];
    const answerChecked = checkedSectionIds.includes(section.id);
    const correct =
      answerChecked &&
      isCorrectSelection(selectedChoiceIds, section.correctChoiceIds);

    return (
      <div key={section.id} className="my-5">
        <div
          className="dp-qb-answer-choices"
          role={section.selectionMode === 'multiple' ? 'group' : 'radiogroup'}
          aria-label="Answer choices"
        >
          {section.choices.map((choice) => {
            const isSelected = selectedChoiceIds.includes(choice.id);
            const isCorrect =
              answerChecked && section.correctChoiceIds.includes(choice.id);
            const isIncorrect = answerChecked && isSelected && !isCorrect;
            const answerStateLabel = !answerChecked
              ? null
              : isSelected && isCorrect
                ? 'Your answer · Correct'
                : isIncorrect
                  ? 'Your answer · Incorrect'
                  : isCorrect
                    ? 'Correct answer'
                    : null;
            const maxReached =
              section.selectionMode === 'multiple' &&
              selectedChoiceIds.length >= section.requiredSelectionCount &&
              !isSelected;
            return (
              <button
                key={choice.id}
                type="button"
                role={section.selectionMode === 'multiple' ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                disabled={answerChecked || maxReached}
                onClick={() => toggleChoice(section.id, choice.id)}
                className={`${isSelected ? 'is-selected' : ''} ${
                  isCorrect ? 'is-correct' : ''
                } ${isIncorrect ? 'is-incorrect' : ''}`.trim()}
              >
                <span className="dp-qb-choice-letter">{choice.label}</span>
                <QuestionContent
                  source={choice.source}
                  assets={nonAudioQuestionAssets}
                />
                {answerStateLabel ? (
                  <span
                    className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isIncorrect
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
                    }`}
                  >
                    {isIncorrect ? (
                      <X className="size-4" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    {answerStateLabel}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {section.selectionMode === 'multiple' && !answerChecked ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void checkSection(section.id)}
            disabled={selectedChoiceIds.length !== section.requiredSelectionCount}
          >
            Check answers
          </button>
        ) : null}
        {answerChecked ? (
          <div
            className={`dp-qb-feedback-banner mt-4 ${
              correct ? 'is-correct' : 'is-incorrect'
            }`}
            aria-live="polite"
          >
            {correct ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <CircleAlert className="size-5" />
            )}
            <div>
              <strong>{correct ? 'Correct — nice work.' : 'Not quite yet.'}</strong>
              {!correct ? (
                <div className="mt-1 space-y-1">
                  <p>
                    <strong>Your answer:</strong>{' '}
                    {answerList(selectedChoiceIds) || 'No answer selected'}.
                  </p>
                  <p>
                    <strong>
                      Correct {section.correctChoiceIds.length > 1 ? 'answers' : 'answer'}:
                    </strong>{' '}
                    {answerList(section.correctChoiceIds)}.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={selectedVariantId ? 'dp-qb-practice-layout is-open' : ''}>
      <section className="min-w-0" aria-label="Question results">
        <div className="dp-qb-results-heading">
          <p>
            <strong>{total.toLocaleString()}</strong> matching question
            {total === 1 ? '' : 's'}
          </p>
          <p>
            Page {Math.min(currentPage, pages)} of {pages}
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {questionRows.map((question, index) => (
            <button
              key={question.variant_id}
              type="button"
              onClick={() => openQuestion(question.variant_id)}
              className={`dp-qb-question-row w-full text-left ${
                selectedVariantId === question.variant_id ? 'is-selected' : ''
              }`}
              data-difficulty={question.difficulty_label || 'unrated'}
              aria-current={
                selectedVariantId === question.variant_id ? 'true' : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="dp-qb-question-number">{index + 1}</span>
                <strong>{question.reference}</strong>
                <span className={difficultyClass(question.difficulty_label)}>
                  {question.difficulty_label || 'Unrated'}
                </span>
                {question.paper_reference ? (
                  <span className="dp-qb-chip dp-qb-paper-chip">
                    {question.paper_reference}
                  </span>
                ) : null}
                <span className="dp-qb-chip dp-qb-mark-chip">
                  {marksLabel(question.maximum_mark)}
                </span>
                <span
                  className={`dp-qb-status-badge ml-auto is-${question.progress_status.replaceAll('_', '-')}`}
                  aria-label={question.progress_status.replaceAll('_', ' ')}
                >
                  {question.progress_status === 'completed' ? (
                    <CheckCircle2 className="size-4" />
                  ) : question.progress_status === 'in_progress' ? (
                    <PlayCircle className="size-4" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                  {question.progress_status.replaceAll('_', ' ')}
                </span>
                {question.is_saved ? (
                  <span className="dp-qb-icon-badge is-saved" title="Saved">
                    <Bookmark className="size-4" fill="currentColor" />
                  </span>
                ) : null}
              </div>
              <p>
                {questionPreview(question.content_preview) ||
                  'No question text in the source.'}
              </p>
              <small>
                {taxonomyLabel(question.topic_name, question.subtopic_names)}
                {question.section ? ` · Section ${question.section}` : ''}
              </small>
            </button>
          ))}
          {!questionRows.length ? (
            <div className="dp-qb-empty">
              No questions match these filters. Try resetting one or more filters.
            </div>
          ) : null}
        </div>

        {pages > 1 ? (
          <nav className="dp-qb-pagination" aria-label="Question pages">
            {previousHref ? (
              <Link href={previousHref}>
                <ChevronLeft className="size-4" /> Previous
              </Link>
            ) : (
              <span />
            )}
            {nextHref ? (
              <Link href={nextHref}>
                Next <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {selectedVariantId ? (
        <aside
          ref={panelRef}
          tabIndex={-1}
          className="dp-qb-practice-pane"
          aria-label="Interactive question"
        >
          <div className="dp-qb-practice-toolbar">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  selectedIndex > 0 &&
                  openQuestion(questionRows[selectedIndex - 1].variant_id)
                }
                disabled={selectedIndex <= 0}
                aria-label="Previous question"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedIndex >= 0 &&
                  selectedIndex < questionRows.length - 1 &&
                  openQuestion(questionRows[selectedIndex + 1].variant_id)
                }
                disabled={
                  selectedIndex < 0 || selectedIndex >= questionRows.length - 1
                }
                aria-label="Next question"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
            <span>
              {selectedIndex >= 0
                ? `${selectedIndex + 1} of ${questionRows.length} on this page`
                : 'Practice question'}
            </span>
            <div className="flex items-center gap-1">
              {detail ? (
                <ReportResourceDialog
                  resource={{
                    resourceName: `Question ${detail.question.reference}`,
                    resourcePath: `${coursePath}?question=${detail.variant.id}`,
                    displayPath: coursePath,
                    mimeType: 'application/x-dp-question',
                  }}
                  categories={QUESTION_REPORT_CATEGORIES}
                  title="Report a question issue"
                  triggerLabel="Report"
                  className="dp-qb-toolbar-report-button"
                />
              ) : null}
              <button type="button" onClick={closeQuestion} aria-label="Close question">
                <X className="size-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="dp-qb-practice-loading" role="status">
              <Loader2 className="size-6 animate-spin" />
              <span>Loading question…</span>
            </div>
          ) : null}
          {error ? (
            <div className="dp-qb-practice-error" role="alert">
              <CircleAlert className="size-5" />
              <span>{error}</span>
              <button type="button" onClick={() => openQuestion(selectedVariantId)}>
                Try again
              </button>
            </div>
          ) : null}

          {detail && interactive && !loading ? (
            <div className="dp-qb-practice-content">
              <header className="dp-qb-practice-header">
                <div>
                  <p className="dp-qb-eyebrow">Interactive practice</p>
                  <h2>{detail.question.reference}</h2>
                  <p>
                    {taxonomyLabel(
                      detail.variant.topicName,
                      detail.variant.subtopicNames,
                    )}
                  </p>
                </div>
                <span className="dp-qb-score-pill">
                  {detail.question.maximumMark > 0
                    ? `${detail.question.maximumMark} mark${
                        detail.question.maximumMark === 1 ? '' : 's'
                      }`
                    : 'Marks not listed'}
                </span>
              </header>

              <div className="dp-qb-practice-meta">
                <span className={difficultyClass(detail.variant.difficultyLabel)}>
                  {detail.variant.difficultyLabel || 'Unrated'}
                </span>
                {detail.variant.paperReference ? (
                  <span className="dp-qb-meta">
                    <FileText className="size-4" />
                    {detail.variant.paperReference}
                  </span>
                ) : null}
                {detail.variant.section ? (
                  <span className="dp-qb-meta">Section {detail.variant.section}</span>
                ) : null}
                {typeof detail.variant.calculatorAllowed === 'boolean' ? (
                  <span className="dp-qb-meta">
                    <Calculator className="size-4" />
                    {detail.variant.calculatorAllowed
                      ? 'Calculator allowed'
                      : 'No calculator'}
                  </span>
                ) : null}
              </div>

              <section className="dp-qb-quiz-card">
                {interactive.sections.length ? (
                  <>
                    {interactive.segments.map((segment, segmentIndex) =>
                      segment.type === 'content' ? (
                        <div
                          key={`content-${segmentIndex}`}
                          className={segmentIndex ? 'mt-6' : undefined}
                        >
                          <QuestionContent
                            source={segment.source}
                            assets={
                              segmentIndex === 0 || segment.source.includes(':audio{')
                                ? questionAssets
                                : nonAudioQuestionAssets
                            }
                          />
                        </div>
                      ) : (
                        renderChoiceSection(segment.sectionId)
                      ),
                    )}
                    {!showExplanation ? (
                      <button
                        type="button"
                        className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[color:var(--dp-navy)] shadow-sm transition hover:bg-slate-50"
                        onClick={revealExplanation}
                      >
                        Reveal full explanation
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <QuestionContent
                      source={interactive.prompt || detail.question.content}
                      assets={questionAssets}
                    />
                    <div className="dp-qb-think-prompt">
                      <Lightbulb className="size-5" />
                      <p>
                        Work through every part first. Reveal the markscheme when you
                        are ready to check your reasoning.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={revealExplanation}
                      disabled={showExplanation}
                    >
                      {showExplanation ? 'Explanation revealed' : 'Reveal explanation'}
                    </button>
                  </>
                )}
              </section>

              {showExplanation ? (
                <section className="dp-qb-feedback" aria-live="polite">
                  {interactive.sections.length && allInteractiveChecked ? (
                    <div
                      className={`dp-qb-feedback-banner ${
                        allInteractiveCorrect ? 'is-correct' : 'is-incorrect'
                      }`}
                    >
                      {allInteractiveCorrect ? (
                        <CheckCircle2 className="size-5" />
                      ) : (
                        <CircleAlert className="size-5" />
                      )}
                      <div>
                        <strong>
                          {allInteractiveCorrect
                            ? 'All choice sections are correct.'
                            : 'Review the checked choice sections.'}
                        </strong>
                        <p>Use the complete markscheme for the written parts and reasoning.</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="dp-qb-explanation-heading">
                    <div>
                      <p className="dp-qb-eyebrow">Understand the reasoning</p>
                      <h3>Answer explanation</h3>
                    </div>
                    <span>
                      {interactive.sections.length
                        ? interactive.isPartialInteraction
                          ? 'Check each choice section, then compare the written responses with the markscheme'
                          : 'Why the selected answers work—and why the alternatives do not'
                        : 'Compare your working with the markscheme'}
                    </span>
                  </div>
                  <QuestionContent
                    source={detail.question.markScheme}
                    assets={markschemeAssets}
                    kind="markscheme"
                  />
                  {!interactive.sections.length || interactive.isPartialInteraction ? (
                    <div className="dp-qb-self-assess">
                      <span>How did you do?</span>
                      <button type="button" onClick={() => selfAssess(true)}>
                        <Check className="size-4" /> I got it
                      </button>
                      <button type="button" onClick={() => selfAssess(false)}>
                        <Circle className="size-4" /> Needs practice
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {hasExaminerReport ? (
                <details className="dp-qb-practice-extra">
                  <summary>
                    <FileText className="size-5" /> Read the examiner report
                  </summary>
                  <div className="mt-4">
                    <QuestionContent
                      source={detail.question.examinerReport}
                      assets={examinerReportAssets}
                      kind="markscheme"
                    />
                  </div>
                </details>
              ) : null}

              <section className="dp-qb-practice-progress">
                <div>
                  <h3>Your progress</h3>
                  <p>Mark your progress or save this question.</p>
                </div>
                <QuestionStateControls
                  key={detail.variant.id}
                  questionId={detail.question.id}
                  variantId={detail.variant.id}
                  initialStatus={detail.progress.status}
                  initialSaved={detail.saved}
                  onStateChange={(state) =>
                    applyQuestionState(detail.variant.id, state)
                  }
                />
              </section>

              <section className="dp-qb-practice-extra">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--dp-navy)]">
                      Answer saved on this device
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Your selected answers and revealed explanation are remembered
                      in this browser only. Resetting answers does not change progress
                      or saved questions.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="dp-qb-state-button"
                      disabled={!hasCurrentAttempt}
                      onClick={resetCurrentAttempt}
                    >
                      <RotateCcw className="size-4" /> Reset this answer
                    </button>
                    <button
                      type="button"
                      className="dp-qb-state-button"
                      onClick={resetEveryAttempt}
                    >
                      <Trash2 className="size-4" /> Reset all answers
                    </button>
                  </div>
                </div>
              </section>

              {detail.videos.length ? (
                <details className="dp-qb-practice-extra">
                  <summary>
                    <PlayCircle className="size-5" /> Watch a solution video
                  </summary>
                  <div className="mt-4 grid gap-5">
                    {detail.videos.map((video, index) => (
                      <div key={`${video.id}-${video.name}`}>
                        <h3 className="mb-2 text-sm font-medium">
                          {video.name || `Solution ${index + 1}`}
                        </h3>
                        <SolutionVideo
                          url={video.url}
                          title={`${detail.question.reference} ${
                            video.name || `solution ${index + 1}`
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              <div className="dp-qb-reference-actions">
                {detail.variant.formulaBookletUrl ? (
                  <a
                    href={detail.variant.formulaBookletUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="dp-qb-formula-link"
                  >
                    Formula booklet (DP Resources)
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
                <ReportResourceDialog
                  resource={{
                    resourceName: `Question ${detail.question.reference}`,
                    resourcePath: `${coursePath}?question=${detail.variant.id}`,
                    displayPath: coursePath,
                    mimeType: 'application/x-dp-question',
                  }}
                  categories={QUESTION_REPORT_CATEGORIES}
                  title="Report a question issue"
                  triggerLabel="Report this question"
                  className="dp-qb-report-button"
                />
              </div>

              <div className="dp-qb-practice-bottom-nav">
                <button
                  type="button"
                  onClick={() =>
                    selectedIndex > 0 &&
                    openQuestion(questionRows[selectedIndex - 1].variant_id)
                  }
                  disabled={selectedIndex <= 0}
                >
                  <ArrowLeft className="size-4" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectedIndex >= 0 &&
                    selectedIndex < questionRows.length - 1 &&
                    openQuestion(questionRows[selectedIndex + 1].variant_id)
                  }
                  disabled={
                    selectedIndex < 0 || selectedIndex >= questionRows.length - 1
                  }
                >
                  Next question <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
