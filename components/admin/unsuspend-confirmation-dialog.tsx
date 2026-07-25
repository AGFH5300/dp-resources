'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { SiteConfirmDialog } from '@/components/ui/site-confirm-dialog';

function isUnsuspendButton(button: HTMLButtonElement) {
  return button.textContent?.replace(/\s+/g, ' ').trim() === 'Unsuspend';
}

export function UnsuspendConfirmationDialogBridge() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingButton, setPendingButton] =
    useState<HTMLButtonElement | null>(null);
  const latestUnsuspendButtonRef = useRef<HTMLButtonElement | null>(null);
  const bypassNextPromptRef = useRef(false);

  useLayoutEffect(() => {
    const originalConfirm = window.confirm.bind(window);
    const rememberUnsuspendButton = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (button instanceof HTMLButtonElement && isUnsuspendButton(button)) {
        latestUnsuspendButtonRef.current = button;
      }
    };
    const interceptConfirm: typeof window.confirm = (value) => {
      if (bypassNextPromptRef.current) {
        bypassNextPromptRef.current = false;
        return true;
      }
      const text = String(value || '');
      if (!/^Unsuspend .+\?$/.test(text)) return originalConfirm(text);
      const button = latestUnsuspendButtonRef.current;
      if (!button || !document.contains(button)) return originalConfirm(text);
      setPendingButton(button);
      setMessage(text);
      setOpen(true);
      return false;
    };

    document.addEventListener('click', rememberUnsuspendButton, true);
    window.confirm = interceptConfirm;
    return () => {
      document.removeEventListener('click', rememberUnsuspendButton, true);
      window.confirm = originalConfirm;
    };
  }, []);

  function close() {
    setOpen(false);
    setMessage('');
  }

  function confirmUnsuspend() {
    const button = pendingButton;
    if (!button || !document.contains(button)) {
      close();
      return;
    }
    bypassNextPromptRef.current = true;
    try {
      button.click();
    } finally {
      queueMicrotask(() => {
        bypassNextPromptRef.current = false;
      });
    }
    setPendingButton(null);
    close();
  }

  return (
    <SiteConfirmDialog
      open={open}
      title="Unsuspend this user?"
      description={message || 'This user will regain access to DP Resources.'}
      onClose={close}
    >
      <p className="text-sm text-[color:var(--dp-muted-text)]">
        The account will become active immediately and the previous suspension
        reason will no longer block sign-in.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-autofocus
          onClick={close}
          className="rounded-md border border-[color:var(--dp-theme-border)] bg-[color:var(--dp-page)] px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirmUnsuspend}
          className="rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Unsuspend user
        </button>
      </div>
    </SiteConfirmDialog>
  );
}
