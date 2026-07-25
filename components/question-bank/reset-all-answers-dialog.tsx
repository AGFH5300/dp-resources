'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SiteConfirmDialog } from '@/components/ui/site-confirm-dialog';

const RESET_PROMPT_PREFIX =
  'Reset every locally saved Question Bank answer on this device?';

function isResetAllButton(button: HTMLButtonElement) {
  return button.textContent?.replace(/\s+/g, ' ').trim() === 'Reset all answers';
}

export function ResetAllAnswersDialogBridge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    setError('');
  }

  function runExistingAnswerReset() {
    const button = pendingButton;
    if (!button || !document.contains(button)) {
      setError('The reset control is no longer available. Please close this and try again.');
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
      toast.success('All Question Bank progress was reset to Not started.');
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

  return (
    <SiteConfirmDialog
      open={open}
      title="Reset all Question Bank answers?"
      description={
        <>
          Choose how much to clear. Saved questions will remain saved in both
          options.
        </>
      }
      onClose={close}
    >
      <div className="space-y-3">
        <button
          type="button"
          data-autofocus
          disabled={busy}
          onClick={runExistingAnswerReset}
          className="w-full rounded-lg border border-[color:var(--dp-theme-border)] bg-[color:var(--dp-page)] px-4 py-3 text-left disabled:opacity-60"
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
          disabled={busy}
          onClick={() => void resetAnswersAndProgress()}
          className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-left text-red-900 hover:bg-red-100 disabled:opacity-60"
        >
          <span className="block font-semibold">
            {busy ? 'Resetting…' : 'Reset answers and progress'}
          </span>
          <span className="mt-1 block text-sm text-red-800/80">
            Also resets every Question Bank status to Not started. Saved
            questions are not removed.
          </span>
        </button>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded-md border border-[color:var(--dp-theme-border)] bg-[color:var(--dp-page)] px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </SiteConfirmDialog>
  );
}
