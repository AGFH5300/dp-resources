import type { Metadata } from 'next'
import { BrandMark } from '@/components/brand-mark'

const MYP_DRIVE_URL = process.env.NEXT_PUBLIC_MYP_DRIVE_URL || 'https://drive.google.com'
const RESOURCES_HUB_URL = process.env.NEXT_PUBLIC_RESOURCES_HUB_URL || 'https://resources.anshgupta.cc'

export const metadata: Metadata = {
  title: 'MYP Resources | Ansh Gupta',
  description: 'Open the MYP resources Google Drive folder.',
  robots: { index: true, follow: true },
}

export default function MypResourcesPage() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] px-5 py-8 text-[#10243f] sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
        <div className="rounded-[2rem] border border-[#e5dccd] bg-white p-6 text-center shadow-sm sm:p-10">
          <BrandMark className="mx-auto h-16 w-16" title="MYP Resources" />
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">MYP resources</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#10243f] sm:text-6xl">Open the MYP resource folder.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            This page is a simple shortcut to the MYP resources Google Drive folder.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={MYP_DRIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full justify-center rounded-full bg-[#10243f] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#17385f] sm:w-auto"
            >
              Open Google Drive
            </a>
            <a
              href={RESOURCES_HUB_URL}
              className="inline-flex w-full justify-center rounded-full border border-[#d9ccba] bg-[#fffaf1] px-6 py-3 text-sm font-semibold text-[#10243f] transition hover:border-[#10243f] sm:w-auto"
            >
              Back to all resources
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
