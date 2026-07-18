'use client';

import { Nav } from '@/components/nav';

export default function LibraryError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">
            We couldn’t load this folder.
          </h1>
          <p className="mt-2 text-slate-600">
            Please try again. If the issue continues, contact a DP Resources
            administrator.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </main>
    </>
  );
}
