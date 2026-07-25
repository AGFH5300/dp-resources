'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';

import { SiteConfirmDialog } from '@/components/ui/site-confirm-dialog';

const RESET_PROMPT_PREFIX =
  'Reset every locally saved Question Bank answer on this device?';

type ResetScope = 'answers' | 'all_progress';

function isResetAllButton(button: HTMLButtonElement) {
  return button.textContent?.replace(/\s+/g, ' ').trim() === 'Reset all answers';
}

export function ResetAllAnswersDialogBridge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<ResetScope>('answers');
  const [pendingButton, setPendingButton] =
    useState<HTMLButtonElement | null>(null);
  const latestResetButtonRef = useRef<HTMLButtonElement | null>(null);
  const bypassNextPromptRef = useRef(false);

  useLayoutEffect(() => {
    const originalConfirm = window.confirm.bind(window);
    const rememberResetButton = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (button instanceof HTMLButtonElement && isResetAllButton(button)) {
        latestResetButtonRef.current = button;
      }
    };
    const interceptConfirm: typeof window.confirm = (message) => {
      if (bypassNextPromptRef.current) {
        bypassNextPromptRef.current = false;
        return true;
      }
      const text = String(message || '');
      if (!text.startsWith(RESET_PROMPT_PREFIX)) return originalConfirm(text);
      const button = latestResetButtonRef.current;
      if (!button || !document.contains(button)) return originalConfirm(text);
      setPendingButton(button);
      setScope('answers');
      setError('');
      setOpen(true);
      return false;
    };

    document.addEventListener('click', rememberResetButton, true);
    window.confirm = interceptConfirm;
    return () => {
      document.removeEventListener('click', rememberResetButton, true);
      window.confirm = originalConfirm;
    };
  }, []);

  function close() {
    if (busy) return;
    setOpen(false);
    setPendingButton(null);
    setError('');
  }

  function runExistingAnswerReset() {
    const button = pendingButton;
    if (!button || !document.contains(button)) {
      setError(
        'The reset control is no longer available. Please close this and try again.',
      );
      return false;
    }
    bypassNextPromptRef.current = true;
    try {
      button.click();
    } finally {
      queueMicrotask(() => {
        bypassNextPromptRef.current = false;
      });
    }
    setOpen(false);
    setPendingButton(null);
    setError('');
    return true;
  }

  async function resetAnswersAndProgress() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/question-bank/state', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all_progress' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'Could not reset Question Bank progress.',
        );
      }
      if (!runExistingAnswerReset()) return;
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not reset Question Bank progress.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    if (scope === 'all_progress') {
      await resetAnswersAndProgress();
      return;
    }
    runExistingAnswerReset();
  }

  return (
    <>
      <SiteConfirmDialog
        open={open}
        title="Reset all Question Bank answers?"
        description={
          <>
            Choose how much to clear, then confirm. Saved questions will remain
            saved in both options.
          </>
        }
        onClose={close}
      >
        <div className="space-y-3">
          <button
            type="button"
            data-autofocus
            aria-pressed={scope === 'answers'}
            disabled={busy}
            onClick={() => setScope('answers')}
            className={`w-full rounded-lg border bg-[color:var(--dp-page)] px-4 py-3 text-left disabled:opacity-60 ${
              scope === 'answers'
                ? 'border-blue-500 ring-2 ring-blue-500/20'
                : 'border-[color:var(--dp-theme-border)]'
            }`}
          >
            <span className="block font-semibold text-[color:var(--dp-navy)]">
              Reset answers only
            </span>
            <span className="mt-1 block text-sm text-[color:var(--dp-muted-text)]">
              Clears every answer and revealed explanation saved in this browser.
              Progress statuses are not changed.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={scope === 'all_progress'}
            disabled={busy}
            onClick={() => setScope('all_progress')}
            className={`dp-qb-reset-danger-option w-full rounded-lg border px-4 py-3 text-left disabled:opacity-60 ${
              scope === 'all_progress' ? 'is-selected' : ''
            }`}
          >
            <span className="block font-semibold">
              Reset answers and progress
            </span>
            <span className="dp-qb-reset-danger-copy mt-1 block text-sm">
              Also resets every Question Bank status to Not started. Saved
              questions are not removed.
            </span>
          </button>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="rounded-md border border-[color:var(--dp-theme-border)] bg-[color:var(--dp-page)] px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmReset()}
              className={`rounded-md border px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                scope === 'all_progress'
                  ? 'border-red-700 bg-red-700 hover:bg-red-800'
                  : 'border-[color:var(--dp-navy)] bg-[color:var(--dp-navy)] hover:opacity-90'
              }`}
            >
              {busy ? 'Resetting…' : 'Confirm reset'}
            </button>
          </div>
        </div>
      </SiteConfirmDialog>
      <style jsx global>{`
        .dp-qb-reset-danger-option {
          border-color: #fca5a5;
          background: #fff1f2;
          color: #991b1b;
        }
        .dp-qb-reset-danger-option:hover:not(:disabled),
        .dp-qb-reset-danger-option.is-selected {
          border-color: #ef4444;
          background: #ffe4e6;
        }
        .dp-qb-reset-danger-option.is-selected {
          box-shadow: 0 0 0 2px rgb(239 68 68 / 0.2);
        }
        .dp-qb-reset-danger-copy {
          color: #b91c1c;
        }
        html[data-theme='dark'] .dp-qb-reset-danger-option {
          border-color: #7f1d1d;
          background: #351720;
          color: #fecaca;
        }
        html[data-theme='dark'] .dp-qb-reset-danger-option:hover:not(:disabled),
        html[data-theme='dark'] .dp-qb-reset-danger-option.is-selected {
          border-color: #ef4444;
          background: #431d27;
        }
        html[data-theme='dark'] .dp-qb-reset-danger-copy {
          color: #fca5a5;
        }
      `}</style>
    </>
  );
}
