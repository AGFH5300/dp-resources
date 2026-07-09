import type { Metadata } from 'next'
import { BrandMark } from '@/components/brand-mark'

const DP_RESOURCES_URL = process.env.NEXT_PUBLIC_DP_RESOURCES_URL || 'https://dp.resources.anshgupta.cc'
const MYP_RESOURCES_URL = process.env.NEXT_PUBLIC_MYP_RESOURCES_URL || 'https://myp.resources.anshgupta.cc'

export const metadata: Metadata = {
  title: 'Resources | Ansh Gupta',
  description: 'Choose between MYP and DP study resources.',
  robots: { index: true, follow: true },
}

export default function ResourcesHubPage() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] px-5 py-8 text-[#10243f] sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <div className="rounded-[2rem] border border-[#e5dccd] bg-white p-6 shadow-sm sm:p-10">
          <div className="flex items-center gap-3">
            <BrandMark className="h-12 w-12" title="Resources" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">Study resources</p>
              <h1 className="text-3xl font-semibold tracking-tight text-[#10243f] sm:text-5xl">Choose your resource library.</h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Select the section you need. MYP resources open through the shared Google Drive library, while DP resources open the DP Resources portal.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <a
              href={MYP_RESOURCES_URL}
              className="group rounded-3xl border border-[#e5dccd] bg-[#fffaf1] p-6 transition hover:-translate-y-0.5 hover:border-[#10243f]/25 hover:shadow-md"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b5832d]">MYP</p>
              <h2 className="mt-3 text-2xl font-semibold text-[#10243f]">MYP Resources</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Open the MYP resources landing page and continue to the Google Drive folder.</p>
              <span className="mt-5 inline-flex rounded-full bg-[#10243f] px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-[#17385f]">Open MYP resources</span>
            </a>

            <a
              href={DP_RESOURCES_URL}
              className="group rounded-3xl border border-[#e5dccd] bg-[#fffaf1] p-6 transition hover:-translate-y-0.5 hover:border-[#10243f]/25 hover:shadow-md"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b5832d]">DP</p>
              <h2 className="mt-3 text-2xl font-semibold text-[#10243f]">DP Resources</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Open the DP Resources portal for the organised DP resource library.</p>
              <span className="mt-5 inline-flex rounded-full bg-[#10243f] px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-[#17385f]">Open DP resources</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
