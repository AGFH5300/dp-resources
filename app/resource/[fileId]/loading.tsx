import { Nav } from '@/components/nav';

export default function LoadingResource() {
  return (
    <>
      <Nav />
      <main
        className="mx-auto max-w-7xl px-4 py-5"
        aria-busy="true"
        aria-label="Opening resource"
      >
        <div className="mb-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Opening resource
              </p>
              <div className="mt-2 h-5 w-52 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-4 w-20 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="flex gap-2" aria-hidden="true">
              <div className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
              <div className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
            </div>
          </div>
        </div>

        <section className="relative min-h-[72vh] overflow-hidden border border-slate-200 bg-white">
          <div className="absolute inset-x-0 top-0 flex h-12 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3">
            <div className="h-7 w-7 animate-pulse rounded bg-slate-200" />
            <div className="h-7 w-7 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="grid min-h-[72vh] place-items-center px-6 pt-12">
            <div className="w-full max-w-3xl space-y-3">
              <div className="mx-auto h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-[58vh] animate-pulse rounded-md bg-slate-100" />
            </div>
          </div>
        </section>
        <span className="sr-only">Opening resource preview</span>
      </main>
    </>
  );
}
