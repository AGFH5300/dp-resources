import Link from 'next/link'
import type { Metadata } from 'next'
import { BrandWordmark } from '@/components/brand-wordmark'
import { ChangelogList } from './changelog-list'
import { getChangelog } from '@/lib/changelog'
import { publicPageMetadata } from '@/lib/seo'

export const revalidate = 3600

export const metadata: Metadata = publicPageMetadata({
  title: 'Changelog',
  description: 'A dated record of new features, improvements, and fixes released to DP Resources.',
  path: '/changelog',
})

export default async function ChangelogPage() {
  const { entries } = await getChangelog()

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
      <header className="border-b border-[#e5dccd] bg-[#f6f1e8] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-4">
          <BrandWordmark href="/" className="text-base sm:text-lg" />
          <nav className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-4" aria-label="Changelog navigation">
            <Link href="/privacy" className="hidden whitespace-nowrap text-slate-600 hover:text-[#10243f] sm:inline">Privacy</Link>
            <Link href="/terms" className="hidden whitespace-nowrap text-slate-600 hover:text-[#10243f] sm:inline">Terms</Link>
            <Link href="/library" className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4">
              Open library
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">DP Resources</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#10243f] sm:text-5xl">Changelog</h1>
          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            A plain-language record of the features, improvements, and fixes released to DP Resources.
          </p>
        </section>

        <ChangelogList entries={entries} />
      </div>
    </main>
  )
}
