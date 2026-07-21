export default function QuestionBankLoading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-6 w-64 rounded bg-slate-200" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="h-[520px] rounded-lg bg-slate-100" />
        <div className="space-y-3">
          <div className="h-32 rounded-lg bg-slate-100" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-28 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </main>
  );
}
