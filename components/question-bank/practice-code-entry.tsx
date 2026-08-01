'use client';

import { ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

function formatCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return compact.length > 4
    ? `${compact.slice(0, 4)}-${compact.slice(4)}`
    : compact;
}

export function PracticeCodeEntry({
  autoFocus = true,
}: {
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const valid = code.replace('-', '').length === 8;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/question-bank/practice-shares/${encodeURIComponent(code)}`,
        { headers: { accept: 'application/json' } },
      );
      const payload = await response.json();
      if (!response.ok || !payload.valid)
        throw new Error(payload.error || 'That practice-set code is invalid.');
      router.push(`/question-bank/join/${encodeURIComponent(payload.code || code)}`);
    } catch (reason) {
      setLoading(false);
      setError(
        reason instanceof Error
          ? reason.message
          : 'That practice-set code is invalid.',
      );
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <label className="block">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Practice-set code
        </span>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div
            className={`flex min-h-12 flex-1 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-2 dark:bg-slate-950 ${
              error
                ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20 dark:border-red-700'
                : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-blue-500/20 dark:border-slate-700'
            }`}
          >
            <KeyRound className="size-5 text-slate-500" />
            <input
              value={code}
              onChange={(event) => {
                setCode(formatCode(event.target.value));
                if (error) setError('');
              }}
              placeholder="ABCD-EFGH"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              aria-label="Practice-set code"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'practice-code-error' : undefined}
              autoFocus={autoFocus}
            />
          </div>
          <button
            type="submit"
            disabled={!valid || loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? 'Opening…' : 'Open set'}
            {!loading ? <ArrowRight className="size-4" /> : null}
          </button>
        </div>
      </label>
      {error ? (
        <p
          id="practice-code-error"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/45 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Enter the eight-character code shared with you.
      </p>
    </form>
  );
}
