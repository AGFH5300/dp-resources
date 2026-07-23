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
  X,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { QuestionContent } from '@/components/question-bank/question-content';
import { QuestionStateControls } from '@/components/question-bank/question-state-controls';
import { SolutionVideo } from '@/components/question-bank/solution-video';
import { ReportResourceDialog } from '@/components/resource-actions';
import { questionPreview } from '@/lib/question-bank/content-normalization';
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';
import {
  marksLabel,
  taxonomyLabel,
} from '@/lib/question-bank/presentation';
import type {
  QuestionAsset,
  QuestionListRow,
  QuestionProgressStatus,
} from '@/lib/question-bank/types';

function difficultyClass(value: string | null) {
  const difficulty = String(value || '').toLowerCase();
  return `dp-qb-difficulty dp-qb-difficulty-${
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? difficulty
      : 'unrated'
  }`;
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
  progress: {
    status: QuestionProgressStatus;
  };
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
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answerChecked, setAnswerChecked] = useState(false);
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
          )
        : null,
    [detail],
  );

  useEffect(() => {
    setQuestionRows(questions);
  }, [questions]);

  useEffect(() => {
    setSelectedVariantId(initialVariantId);
  }, [initialVariantId]);

  useEffect(() => {
    if (!selectedVariantId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedChoice(null);
    setAnswerChecked(false);
    setShowExplanation(false);
    fetch(`/api/question-bank/questions/${selectedVariantId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load this question.');
        return (await response.json()) as QuestionDetail;
      })
      .then((payload) => {
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
  }

  function applyQuestionState(
    variantId: string,
    state: {
      status?: QuestionProgressStatus;
      saved?: boolean;
    },
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

  async function checkAnswer(choiceId: string) {
    if (!detail || answerChecked) return;
    setSelectedChoice(choiceId);
    setAnswerChecked(true);
    setShowExplanation(true);
    const previousStatus = detail.progress.status;
    applyQuestionState(detail.variant.id, { status: 'completed' });
    try {
      await updateQuestionState(detail, { status: 'completed' });
    } catch {
      applyQuestionState(detail.variant.id, { status: previousStatus });
      toast.error('Your answer was checked, but progress could not be saved.');
    }
  }

  async function selfAssess(gotIt: boolean) {
    if (!detail) return;
    const previous = {
      status: detail.progress.status,
    };
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

  const questionAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'question' || asset.role === 'content_reference',
  );
  const markschemeAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'markscheme',
  );
  const examinerReportAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'examiner_report',
  );
  const correct =
    answerChecked &&
    interactive?.correctChoiceId &&
    selectedChoice === interactive.correctChoiceId;

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
                {taxonomyLabel(
                  question.topic_name,
                  question.subtopic_names,
                )}
                {question.section ? ` · Section ${question.section}` : ''}
              </small>
            </button>
          ))}
          {!questionRows.length ? (
            <div className="dp-qb-empty">
              No questions match these filters. Try resetting one or more
              filters.
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
                disabled={selectedIndex < 0 || selectedIndex >= questionRows.length - 1}
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
            <button type="button" onClick={closeQuestion} aria-label="Close question">
              <X className="size-4" />
            </button>
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
                  <span className="dp-qb-meta">
                    Section {detail.variant.section}
                  </span>
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
                <QuestionContent
                  source={interactive.prompt || detail.question.content}
                  assets={questionAssets}
                />

                {interactive.choices.length ? (
                  <div className="dp-qb-answer-choices" role="radiogroup">
                    {interactive.choices.map((choice) => {
                      const isSelected = selectedChoice === choice.id;
                      const isCorrect =
                        answerChecked &&
                        interactive.correctChoiceId === choice.id;
                      const isIncorrect =
                        answerChecked && isSelected && !isCorrect;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={answerChecked}
                          onClick={() => void checkAnswer(choice.id)}
                          className={`${isSelected ? 'is-selected' : ''} ${
                            isCorrect ? 'is-correct' : ''
                          } ${isIncorrect ? 'is-incorrect' : ''}`.trim()}
                        >
                          <span className="dp-qb-choice-letter">{choice.label}</span>
                          <QuestionContent source={choice.source} />
                          {isCorrect ? <Check className="ml-auto size-5" /> : null}
                          {isIncorrect ? <X className="ml-auto size-5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dp-qb-think-prompt">
                    <Lightbulb className="size-5" />
                    <p>
                      Work through your answer first. Reveal the explanation when
                      you are ready to check your reasoning.
                    </p>
                  </div>
                )}

                {!interactive.choices.length ? (
                  <button
                    type="button"
                    className="dp-qb-check-answer"
                    onClick={() => setShowExplanation(true)}
                    disabled={showExplanation}
                  >
                    {showExplanation ? 'Explanation revealed' : 'Reveal explanation'}
                  </button>
                ) : null}
              </section>

              {showExplanation ? (
                <section className="dp-qb-feedback" aria-live="polite">
                  {interactive.choices.length && interactive.correctChoiceId ? (
                    <div
                      className={`dp-qb-feedback-banner ${
                        correct ? 'is-correct' : 'is-incorrect'
                      }`}
                    >
                      {correct ? (
                        <CheckCircle2 className="size-5" />
                      ) : (
                        <CircleAlert className="size-5" />
                      )}
                      <div>
                        <strong>{correct ? 'Correct — nice work.' : 'Not quite yet.'}</strong>
                        {!correct ? (
                          <p>
                            The correct answer is {interactive.correctChoiceId}.
                            Review the reasoning below before moving on.
                          </p>
                        ) : (
                          <p>Use the explanation to lock in why it is correct.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="dp-qb-explanation-heading">
                    <div>
                      <p className="dp-qb-eyebrow">Understand the reasoning</p>
                      <h3>Answer explanation</h3>
                    </div>
                    <span>
                      {interactive.choices.length
                        ? 'Why the answer works—and why the alternatives do not'
                        : 'Compare your working with the markscheme'}
                    </span>
                  </div>
                  <QuestionContent
                    source={detail.question.markScheme}
                    assets={markschemeAssets}
                    kind="markscheme"
                  />
                  {!interactive.choices.length ? (
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

              {detail.question.examinerReport ? (
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
                    mimeType: 'application/x-dp-question',
                  }}
                  categories={[
                    'Broken image or diagram',
                    'Broken solution video',
                    'Wrong answer or markscheme',
                    'Question text or layout problem',
                    'Wrong topic or metadata',
                    'Duplicate question',
                    'Other',
                  ]}
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
