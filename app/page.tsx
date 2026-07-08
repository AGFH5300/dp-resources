import Link from 'next/link'
import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Private DP Study Resource Library',
  description: 'DP Resources provides account-based access to a curated private library of study materials, notes, documents, and school resources.',
  path: '/',
})

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-[#d9ccba] pb-5">
          <Link href="/" className="text-sm font-bold uppercase tracking-[0.18em] text-[#10243f]">DP Resources</Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <Link href="/privacy" className="text-[#5d6470] hover:text-[#10243f]">Privacy</Link>
            <Link href="/terms" className="text-[#5d6470] hover:text-[#10243f]">Terms</Link>
            <Link href="/auth/login" className="rounded-full border border-[#10243f] px-4 py-2 text-[#10243f] hover:bg-white">Log in</Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">Private resource access</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-[#10243f] sm:text-6xl">
              A focused study library for DP resources.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5563]">
              DP Resources gives signed-in users a clean, account-based way to access organised study materials, documents, presentations, spreadsheets, and supporting school resources from one secure portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/sign-up" className="rounded-full bg-[#10243f] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#17385f]">Request access</Link>
              <Link href="/auth/login" className="rounded-full border border-[#d9ccba] bg-[#fffaf1] px-6 py-3 text-sm font-semibold text-[#10243f] hover:border-[#10243f]">Log in</Link>
            </div>
          </section>

          <section aria-label="Platform highlights" className="rounded-[2rem] border border-[#d9ccba] bg-[#fffaf1] p-6 shadow-sm">
            <div className="rounded-2xl bg-[#10243f] p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d6a84f]">Library</p>
              <h2 className="mt-3 text-2xl font-semibold">Organised, searchable, protected.</h2>
              <p className="mt-3 text-sm leading-6 text-[#d8e0ea]">Open resources, preview files, download when needed, save useful material, and report broken or outdated content.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['PDF previews', 'PPTX previews', 'Resource search', 'Usage-aware support'].map((item) => (
                <div key={item} className="rounded-2xl border border-[#eadfce] bg-white p-4 text-sm font-medium text-[#334155]">{item}</div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
