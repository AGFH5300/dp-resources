import { Nav } from '@/components/nav';

export default function LoadingLibrary() {
  return (
    <>
      <Nav />
      <main
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
        aria-busy="true"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-40 rounded bg-slate-200" />
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2">
            <div className="h-8 w-24 rounded bg-slate-200" />
            <div className="flex gap-1">
              <div className="h-8 w-8 rounded bg-slate-200" />
              <div className="h-8 w-8 rounded bg-slate-200" />
            </div>
          </div>
          <div className="overflow-hidden border-y border-slate-200 bg-white">
            <div className="hidden h-9 border-b border-slate-200 bg-slate-50 md:block" />
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="grid min-h-12 grid-cols-[1fr_44px] items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(260px,1fr)_220px_120px_120px_90px_56px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-5 w-5 shrink-0 rounded bg-slate-200" />
                  <div className="h-4 w-44 max-w-[55vw] rounded bg-slate-200" />
                </div>
                <div className="hidden h-4 w-32 rounded bg-slate-100 md:block" />
                <div className="hidden h-4 w-20 rounded bg-slate-100 md:block" />
                <div className="hidden h-4 w-20 rounded bg-slate-100 md:block" />
                <div className="hidden h-4 w-14 rounded bg-slate-100 md:block" />
                <div className="h-6 w-6 justify-self-end rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading Library</span>
      </main>
    </>
  );
}
