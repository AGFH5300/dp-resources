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
}: {
  questionId: string;
  variantId: string;
  initialStatus: QuestionProgressStatus;
  initialRevisit: boolean;
  initialSaved: boolean;
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
    void fetch('/api/question-bank/state', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, variantId, viewed: true }),
    });
  }, [questionId, variantId]);

  function changeStatus(next: QuestionProgressStatus) {
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      try {
        await update({ status: next });
        toast.success('Progress updated.');
      } catch {
        setStatus(previous);
        toast.error('Could not update progress.');
      }
    });
  }

  function toggleRevisit() {
    const next = !revisit;
    setRevisit(next);
    startTransition(async () => {
      try {
        await update({ toRevisit: next });
      } catch {
        setRevisit(!next);
        toast.error('Could not update revisit status.');
      }
    });
  }

  function toggleSaved() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      try {
        await update({ saved: next });
      } catch {
        setSaved(!next);
        toast.error('Could not update saved questions.');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <button
        type="button"
        onClick={() => changeStatus('not_started')}
        className={`dp-qb-state-button ${status === 'not_started' ? 'is-active' : ''}`}
      >
        <Circle className="size-4" /> Not started
      </button>
      <button
        type="button"
        onClick={() => changeStatus('in_progress')}
        className={`dp-qb-state-button ${status === 'in_progress' ? 'is-active' : ''}`}
      >
        <PlayCircle className="size-4" /> In progress
      </button>
      <button
        type="button"
        onClick={() => changeStatus('completed')}
        className={`dp-qb-state-button ${status === 'completed' ? 'is-active' : ''}`}
      >
        <CheckCircle2 className="size-4" /> Completed
      </button>
      <button
        type="button"
        onClick={toggleRevisit}
        className={`dp-qb-state-button ${revisit ? 'is-active is-revisit' : ''}`}
      >
        <Flag className="size-4" /> To revisit
      </button>
      <button
        type="button"
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
