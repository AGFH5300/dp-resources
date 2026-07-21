'use client';

export default function QuestionBankError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-[color:var(--dp-navy)]">
        The question bank could not be loaded
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Try again. If the problem continues, the import may still be being verified.
      </p>
      <button type="button" onClick={reset} className="tsm-btn-primary mt-5">
        Try again
      </button>
    </main>
  );
}
