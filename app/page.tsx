import Link from 'next/link'
import type { Metadata } from 'next'
import { BrandWordmark } from '@/components/brand-wordmark'
import { BrandMark } from '@/components/brand-mark'
import { publicPageMetadata } from '@/lib/seo'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = publicPageMetadata({
  title: 'Free DP Study Resource Library',
  description: 'DP Resources provides free account-based access to a curated library of study materials, notes, documents, and school resources.',
  path: '/',
})

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-3 border-b border-[#d9ccba] pb-5 sm:gap-4">
          <BrandWordmark href="/" className="text-base sm:text-xl" />
          <nav className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-3">
            <ThemeToggle />
            <Link href="/privacy" className="hidden whitespace-nowrap text-[#5d6470] hover:text-[#10243f] sm:inline">Privacy</Link>
            <Link href="/terms" className="hidden whitespace-nowrap text-[#5d6470] hover:text-[#10243f] sm:inline">Terms</Link>
            <Link href="/auth/login" className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4">Log in</Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">Free resource access</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-[#10243f] sm:text-6xl">
              A focused study library for DP resources.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5563]">
              DP Resources gives everyone a free, account-based way to access organised study materials, documents, presentations, spreadsheets, and supporting school resources from one clean portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/sign-up" className="rounded-full bg-[#10243f] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#17385f]">Sign up</Link>
              <Link href="/auth/login" className="whitespace-nowrap rounded-full border border-[#d9ccba] bg-[#fffaf1] px-6 py-3 text-sm font-semibold text-[#10243f] hover:border-[#10243f]">Log in</Link>
            </div>
          </section>

          <section aria-label="Platform highlights" className="rounded-[2rem] border border-[#d9ccba] bg-[#fffaf1] p-6 shadow-sm">
            <div className="rounded-2xl bg-white p-6 text-[#061a34] shadow-sm">
              <BrandMark className="h-24 w-24" title="DP Resources logo" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#b5832d]">Library</p>
              <h2 className="mt-3 text-2xl font-semibold">Organised, searchable, free.</h2>
              <p className="mt-3 text-sm leading-6 text-[#4b5563]">Open resources, preview files, download when needed, save useful material, and report broken or outdated content.</p>
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
