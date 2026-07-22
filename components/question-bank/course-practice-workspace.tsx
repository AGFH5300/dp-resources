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
  CircleAlert,
  ExternalLink,
  FileText,
  Flag,
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
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';
import type {
  QuestionAsset,
  QuestionListRow,
  QuestionProgressStatus,
} from '@/lib/question-bank/types';

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
    maximumMark: number;
  };
  assets: QuestionAsset[];
  videos: Array<{ id: string; name: string | null; url: string }>;
  progress: {
    status: QuestionProgressStatus;
    to_revisit: boolean;
  };
  saved: boolean;
};

function preview(value: string) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\(question:[^)]+\)/g, '[image]')
    .replace(/:{1,3}[a-z]+(?:\[[^\]]*\])?/gi, ' ')
    .replace(/[*_$\\{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
}: {
  questions: QuestionListRow[];
  total: number;
  currentPage: number;
  pages: number;
  previousHref: string | null;
  nextHref: string | null;
  initialVariantId: string | null;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId,
  );
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answerChecked, setAnswerChecked] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const selectedIndex = questions.findIndex(
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

  function openQuestion(variantId: string) {
    setSelectedVariantId(variantId);
    syncQuestionToUrl(variantId);
  }

  function closeQuestion() {
    setSelectedVariantId(null);
    syncQuestionToUrl(null);
  }

  async function checkAnswer() {
    if (!detail || !selectedChoice) return;
    setAnswerChecked(true);
    setShowExplanation(true);
    try {
      await updateQuestionState(detail, { status: 'completed' });
    } catch {
      toast.error('Your answer was checked, but progress could not be saved.');
    }
  }

  async function selfAssess(gotIt: boolean) {
    if (!detail) return;
    try {
      await updateQuestionState(
        detail,
        gotIt
          ? { status: 'completed', toRevisit: false }
          : { status: 'in_progress', toRevisit: true },
      );
      toast.success(gotIt ? 'Marked as completed.' : 'Added to your revisit list.');
    } catch {
      toast.error('Could not save your progress.');
    }
  }

  const questionAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'question' || asset.role === 'content_reference',
  );
  const markschemeAssets = (detail?.assets || []).filter(
    (asset) => asset.role === 'markscheme',
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
          {questions.map((question, index) => (
            <button
              key={question.variant_id}
              type="button"
              onClick={() => openQuestion(question.variant_id)}
              className={`dp-qb-question-row w-full text-left ${
                selectedVariantId === question.variant_id ? 'is-selected' : ''
              }`}
              aria-current={
                selectedVariantId === question.variant_id ? 'true' : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="dp-qb-question-number">{index + 1}</span>
                <strong>{question.reference}</strong>
                <span className="dp-qb-chip capitalize">
                  {question.difficulty_label || 'Unrated'}
                </span>
                {question.paper_reference ? (
                  <span className="dp-qb-chip">{question.paper_reference}</span>
                ) : null}
                <span className="dp-qb-chip">
                  {question.maximum_mark} mark
                  {question.maximum_mark === 1 ? '' : 's'}
                </span>
                {question.progress_status === 'completed' ? (
                  <CheckCircle2 className="ml-auto size-4 text-emerald-600" />
                ) : null}
                {question.to_revisit ? (
                  <Flag className="size-4 text-amber-600" />
                ) : null}
                {question.is_saved ? (
                  <Bookmark className="size-4 text-blue-700" fill="currentColor" />
                ) : null}
              </div>
              <p>
                {preview(question.content_preview) ||
                  'No question text in the source.'}
              </p>
              <small>
                {question.topic_name}
                {question.subtopic_names.length
                  ? ` · ${question.subtopic_names.join(', ')}`
                  : ''}
                {question.section ? ` · Section ${question.section}` : ''}
              </small>
            </button>
          ))}
          {!questions.length ? (
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
                  openQuestion(questions[selectedIndex - 1].variant_id)
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
                  selectedIndex < questions.length - 1 &&
                  openQuestion(questions[selectedIndex + 1].variant_id)
                }
                disabled={selectedIndex < 0 || selectedIndex >= questions.length - 1}
                aria-label="Next question"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
            <span>
              {selectedIndex >= 0
                ? `${selectedIndex + 1} of ${questions.length} on this page`
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
                    {detail.variant.topicName}
                    {detail.variant.subtopicNames.length
                      ? ` · ${detail.variant.subtopicNames.join(', ')}`
                      : ''}
                  </p>
                </div>
                <span className="dp-qb-score-pill">
                  {detail.question.maximumMark} mark
                  {detail.question.maximumMark === 1 ? '' : 's'}
                </span>
              </header>

              <div className="dp-qb-practice-meta">
                <span className="dp-qb-chip capitalize">
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
                          onClick={() => setSelectedChoice(choice.id)}
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

                {interactive.choices.length ? (
                  <button
                    type="button"
                    className="dp-qb-check-answer"
                    disabled={!selectedChoice || answerChecked}
                    onClick={checkAnswer}
                  >
                    {answerChecked ? 'Answer checked' : 'Check answer'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dp-qb-check-answer"
                    onClick={() => setShowExplanation(true)}
                    disabled={showExplanation}
                  >
                    {showExplanation ? 'Explanation revealed' : 'Reveal explanation'}
                  </button>
                )}
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
                    <span>Why the answer works—and why the alternatives do not</span>
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
                        <Flag className="size-4" /> Review again
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="dp-qb-practice-progress">
                <div>
                  <h3>Your progress</h3>
                  <p>Save it, finish it, or add it to your revisit queue.</p>
                </div>
                <QuestionStateControls
                  key={detail.variant.id}
                  questionId={detail.question.id}
                  variantId={detail.variant.id}
                  initialStatus={detail.progress.status}
                  initialRevisit={detail.progress.to_revisit}
                  initialSaved={detail.saved}
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

              {detail.variant.formulaBookletUrl ? (
                <a
                  href={detail.variant.formulaBookletUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  referrerPolicy="no-referrer"
                  className="dp-qb-formula-link"
                >
                  Formula booklet (external source)
                  <ExternalLink className="size-4" />
                </a>
              ) : null}

              <div className="dp-qb-practice-bottom-nav">
                <button
                  type="button"
                  onClick={() =>
                    selectedIndex > 0 &&
                    openQuestion(questions[selectedIndex - 1].variant_id)
                  }
                  disabled={selectedIndex <= 0}
                >
                  <ArrowLeft className="size-4" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectedIndex >= 0 &&
                    selectedIndex < questions.length - 1 &&
                    openQuestion(questions[selectedIndex + 1].variant_id)
                  }
                  disabled={
                    selectedIndex < 0 || selectedIndex >= questions.length - 1
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
