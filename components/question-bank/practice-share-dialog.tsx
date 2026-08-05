'use client';

import { Check, Copy, Loader2, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { readPracticeApiJson } from '@/lib/question-bank/practice-api-client';
import type { PracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { readLocalPracticeQueueChunks } from '@/lib/question-bank/local-practice-session-storage';

type ShareButtonAppearance = 'default' | 'summary';

type LocalShareSession = {
  id: string;
  userId: string;
  totalCount: number;
};

export function PracticeShareDialog({
  configuration,
  sessionId,
  localSession,
  disabled = false,
  buttonLabel = 'Share set',
  appearance = 'default',
}: {
  configuration: PracticeConfiguration | null;
  sessionId?: string | null;
  localSession?: LocalShareSession | null;
  disabled?: boolean;
  buttonLabel?: string;
  appearance?: ShareButtonAppearance;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [code, setCode] = useState('');
  const [exactQuestionCount, setExactQuestionCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const configuredQuestionCount =
    localSession?.totalCount ||
    configuration?.blocks.reduce(
      (total, block) => total + block.requestedCount,
      0,
    ) ||
    0;
  const includesExactQueue = Boolean(localSession || sessionId);
  const buttonClass =
    appearance === 'summary'
      ? 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/55 bg-white/12 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white/22 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 disabled:text-blue-200/55'
      : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:border-blue-600 dark:hover:bg-blue-900/50';

  function close() {
    if (loading) return;
    setOpen(false);
  }

  async function uploadLocalExactQueue(shareCode: string) {
    if (!localSession) return 0;
    const local = await readLocalPracticeQueueChunks(
      localSession.id,
      localSession.userId,
    );
    if (local.session.totalCount !== localSession.totalCount)
      throw new Error('The locally stored question count changed. Please reopen the session.');

    let committed = 0;
    for (const chunk of local.chunks) {
      const response = await fetch(
        `/api/question-bank/practice-shares/${encodeURIComponent(shareCode)}/queue`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            startPosition: chunk.startPosition,
            items: chunk.items.map((item, index) => ({
              position: chunk.startPosition + index,
              questionId: item[0],
              variantId: item[1],
              primaryBlockKey: item[2],
              matchedBlockKeys: item[3],
            })),
          }),
        },
      );
      const payload = await readPracticeApiJson<{ committedCount: number }>(
        response,
        'Unable to upload this exact practice queue.',
      );
      committed = Number(payload.committedCount || 0);
      setUploadedCount(committed);
    }

    const finalizeResponse = await fetch(
      `/api/question-bank/practice-shares/${encodeURIComponent(shareCode)}/queue`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedCount: local.session.totalCount }),
      },
    );
    const finalized = await readPracticeApiJson<{
      exactQuestionCount: number;
    }>(finalizeResponse, 'Unable to finalize this exact practice queue.');
    return Number(finalized.exactQuestionCount || 0);
  }

  async function cancelIncompleteLocalShare(shareCode: string) {
    if (!localSession || !shareCode) return;
    await fetch(
      `/api/question-bank/practice-shares/${encodeURIComponent(shareCode)}/queue`,
      { method: 'DELETE', keepalive: true },
    ).catch(() => undefined);
  }

  async function createCode() {
    if (!configuration || loading) return;
    const normalizedName = name.trim();
    if (normalizedName.length < 3) {
      toast.error('Give this practice set a name of at least 3 characters.');
      return;
    }

    setLoading(true);
    setUploadedCount(0);
    let createdCode = '';
    try {
      const response = await fetch('/api/question-bank/practice-shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          configuration,
          sessionId: localSession ? null : sessionId || null,
        }),
      });
      const payload = await readPracticeApiJson<{
        code?: string;
        exactQuestionCount?: number;
      }>(response, 'Unable to create a practice-set code.');
      createdCode = String(payload.code || '');
      if (!createdCode) throw new Error('The practice-set code was missing.');

      const exactCount = localSession
        ? await uploadLocalExactQueue(createdCode)
        : Number(payload.exactQuestionCount || 0);
      setCode(createdCode);
      setExactQuestionCount(exactCount);
      toast.success(
        exactCount
          ? 'Permanent exact practice-set code created.'
          : 'Permanent practice-set code created.',
      );
    } catch (error) {
      await cancelIncompleteLocalShare(createdCode);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to create a practice-set code.',
      );
    } finally {
      setLoading(false);
      setUploadedCount(0);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed. Select the code and copy it manually.');
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !configuration}
        onClick={() => setOpen(true)}
        className={buttonClass}
      >
        <Share2 className="size-4" />
        {buttonLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-share-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <Share2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="practice-share-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Share this practice set
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  The code is permanent. Anyone with a DP Resources account can load
                  the setup and fully customize it for their own progress.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Close share dialog"
              >
                <X className="size-5" />
              </button>
            </div>

            {!code ? (
              <div className="mt-5">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Name this configuration
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value.slice(0, 120))}
                    placeholder="For example, Mechanics and Calculus revision"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    autoFocus
                  />
                </label>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Your public name or username will be shown as the creator. Your
                  answers, saved questions and progress are never included.
                </p>
                {includesExactQueue ? (
                  <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/45 dark:text-blue-100">
                    The exact {configuredQuestionCount.toLocaleString()}-question queue
                    and order will be copied from this device into the permanent share.
                    Ordinary unshared sessions remain local only.
                  </p>
                ) : null}
                {loading && localSession ? (
                  <div className="mt-4" role="status" aria-live="polite">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>Saving the exact queue…</span>
                      <span>
                        {uploadedCount.toLocaleString()} /{' '}
                        {localSession.totalCount.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-blue-700 transition-[width]"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (uploadedCount / Math.max(localSession.totalCount, 1)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void createCode()}
                  disabled={loading || name.trim().length < 3}
                  className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {loading
                    ? localSession
                      ? 'Saving and creating code…'
                      : 'Creating code…'
                    : includesExactQueue
                      ? 'Save exact queue and create code'
                      : 'Create permanent code'}
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Share this code with anyone who should use the configuration:
                </p>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="mt-3 flex w-full items-center justify-between rounded-2xl border border-blue-300 bg-blue-50 px-4 py-4 text-left transition hover:border-blue-500 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/45 dark:hover:border-blue-500 dark:hover:bg-blue-900/55"
                >
                  <span className="font-mono text-2xl font-bold tracking-[0.16em] text-blue-900 dark:text-blue-100">
                    {code}
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  Recipients can choose their own progress filters, edit every topic,
                  course and quantity, or{' '}
                  {exactQuestionCount
                    ? `copy the same ${exactQuestionCount.toLocaleString()} questions and order.`
                    : 'generate a fresh local queue from this setup.'}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
