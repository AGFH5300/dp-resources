'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bookmark, CheckCircle2, Circle, Flag, Loader2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

import type { QuestionProgressStatus } from '@/lib/question-bank/types';

export function QuestionStateControls({
  questionId,
  variantId,
  initialStatus,
  initialRevisit,
  initialSaved,
  onStateChange,
}: {
  questionId: string;
  variantId: string;
  initialStatus: QuestionProgressStatus;
  initialRevisit: boolean;
  initialSaved: boolean;
  onStateChange?: (state: {
    status: QuestionProgressStatus;
    toRevisit: boolean;
    saved: boolean;
  }) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [revisit, setRevisit] = useState(initialRevisit);
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  async function update(payload: Record<string, unknown>) {
    const response = await fetch('/api/question-bank/state', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, variantId, ...payload }),
    });
    if (!response.ok) throw new Error('Unable to update question state.');
    return response.json();
  }

  useEffect(() => {
    setStatus(initialStatus);
    setRevisit(initialRevisit);
    setSaved(initialSaved);
  }, [initialRevisit, initialSaved, initialStatus]);

  useEffect(() => {
    void fetch('/api/question-bank/state', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, variantId, viewed: true }),
    });
  }, [questionId, variantId]);

  function changeStatus(next: QuestionProgressStatus) {
    const previous = status;
    setStatus(next);
    onStateChange?.({ status: next, toRevisit: revisit, saved });
    startTransition(async () => {
      try {
        await update({ status: next });
        toast.success(
          next === 'completed'
            ? 'Question marked complete.'
            : next === 'in_progress'
              ? 'Question marked in progress.'
              : 'Question reset to not started.',
        );
      } catch {
        setStatus(previous);
        onStateChange?.({ status: previous, toRevisit: revisit, saved });
        toast.error('Could not update progress.');
      }
    });
  }

  function toggleRevisit() {
    const next = !revisit;
    setRevisit(next);
    onStateChange?.({ status, toRevisit: next, saved });
    startTransition(async () => {
      try {
        await update({ toRevisit: next });
        toast.success(
          next
            ? 'Added to your review-later list.'
            : 'Removed from your review-later list.',
        );
      } catch {
        setRevisit(!next);
        onStateChange?.({ status, toRevisit: !next, saved });
        toast.error('Could not update review-later status.');
      }
    });
  }

  function toggleSaved() {
    const next = !saved;
    setSaved(next);
    onStateChange?.({ status, toRevisit: revisit, saved: next });
    startTransition(async () => {
      try {
        await update({ saved: next });
        toast.success(next ? 'Question saved.' : 'Question removed from saved.');
      } catch {
        setSaved(!next);
        onStateChange?.({ status, toRevisit: revisit, saved: !next });
        toast.error('Could not update saved questions.');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <button
        type="button"
        disabled={pending}
        onClick={() => changeStatus('not_started')}
        className={`dp-qb-state-button ${status === 'not_started' ? 'is-active' : ''}`}
      >
        <Circle className="size-4" /> Not started
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => changeStatus('in_progress')}
        className={`dp-qb-state-button ${status === 'in_progress' ? 'is-active' : ''}`}
      >
        <PlayCircle className="size-4" /> In progress
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => changeStatus('completed')}
        className={`dp-qb-state-button ${status === 'completed' ? 'is-active' : ''}`}
      >
        <CheckCircle2 className="size-4" /> Completed
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={toggleRevisit}
        className={`dp-qb-state-button ${revisit ? 'is-active is-revisit' : ''}`}
      >
        <Flag className="size-4" /> Review later
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={toggleSaved}
        className={`dp-qb-state-button ${saved ? 'is-active' : ''}`}
      >
        <Bookmark className="size-4" fill={saved ? 'currentColor' : 'none'} />
        {saved ? 'Saved' : 'Save'}
      </button>
      {pending ? <Loader2 className="size-4 animate-spin text-slate-500" /> : null}
    </div>
  );
}
