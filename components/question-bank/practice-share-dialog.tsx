'use client';

import { Check, Copy, Loader2, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { PracticeConfiguration } from '@/lib/question-bank/practice-configuration';

export function PracticeShareDialog({
  configuration,
  sessionId,
  disabled = false,
  buttonLabel = 'Share set',
}: {
  configuration: PracticeConfiguration | null;
  sessionId?: string | null;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [exactQuestionCount, setExactQuestionCount] = useState(0);
  const [copied, setCopied] = useState(false);

  function close() {
    if (loading) return;
    setOpen(false);
  }

  async function createCode() {
    if (!configuration || loading) return;
    const normalizedName = name.trim();
    if (normalizedName.length < 3) {
      toast.error('Give this practice set a name of at least 3 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/question-bank/practice-shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          configuration,
          sessionId: sessionId || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Unable to create a practice-set code.');
      setCode(String(payload.code || ''));
      setExactQuestionCount(Number(payload.exactQuestionCount || 0));
      toast.success('Permanent practice-set code created.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to create a practice-set code.',
      );
    } finally {
      setLoading(false);
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
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:border-blue-600 dark:hover:bg-blue-900/50"
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
                {sessionId ? (
                  <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/45 dark:text-blue-100">
                    This code will also offer the exact {configuration.blocks.reduce(
                      (total, block) => total + block.requestedCount,
                      0,
                    ).toLocaleString()}-question queue and order. Recipients still get
                    their own independent copy.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void createCode()}
                  disabled={loading || name.trim().length < 3}
                  className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create permanent code
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
                  course and quantity, or
                  {exactQuestionCount
                    ? ` copy the same ${exactQuestionCount.toLocaleString()} questions and order.`
                    : ' generate a fresh queue from this setup.'}
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
