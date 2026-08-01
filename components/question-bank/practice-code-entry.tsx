'use client';

import { ArrowRight, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

function formatCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return compact.length > 4
    ? `${compact.slice(0, 4)}-${compact.slice(4)}`
    : compact;
}

export function PracticeCodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const valid = code.replace('-', '').length === 8;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    router.push(`/question-bank/join/${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <label className="block">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Practice-set code
        </span>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950">
            <KeyRound className="size-5 text-slate-500" />
            <input
              value={code}
              onChange={(event) => setCode(formatCode(event.target.value))}
              placeholder="ABCD-EFGH"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              aria-label="Practice-set code"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!valid}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Open set <ArrowRight className="size-4" />
          </button>
        </div>
      </label>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Codes are permanent and can be reused by any DP Resources member.
      </p>
    </form>
  );
}
