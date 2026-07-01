import { Nav } from '@/components/nav';

export default function LoadingLibrary() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-8">
          <div className="space-y-4">
            <div className="h-4 w-72 rounded bg-slate-200" />
            <div className="h-10 w-80 rounded bg-slate-200" />
            <div className="h-11 max-w-sm rounded-xl bg-slate-200" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-2xl border border-slate-200 bg-white" />)}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 border-b border-slate-100 last:border-b-0" />)}
          </div>
        </div>
      </main>
    </>
  );
}
