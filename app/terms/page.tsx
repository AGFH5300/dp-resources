import Link from 'next/link'
import type { Metadata } from 'next'
import { BrandWordmark } from '@/components/brand-wordmark'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Terms of Use',
  description: 'Terms for using DP Resources, including account use, free resource access, reports, support, and platform records.',
  path: '/terms',
})

const sections = [
  {
    title: 'Account use',
    body: 'Use your own account only. Do not share login details, OTP codes, passwords, or account sessions with anyone else.',
  },
  {
    title: 'Resource access',
    body: 'Resources are provided through the DP Resources portal for study and school-related use. Do not misuse, mass-download, redistribute, or publicly repost resources from the platform.',
  },
  {
    title: 'Reports and support',
    body: 'You can report broken, incorrect, duplicate, outdated, or unsuitable resources. Support and report messages should be accurate and respectful.',
  },
  {
    title: 'Platform records',
    body: 'The platform records account details, support/report requests, saved resources, and resource usage analytics. Usage analytics tracks resource access and active viewing duration, not keystrokes or screen recordings.',
  },
  {
    title: 'Admin review',
    body: 'Administrators may review account and usage records to maintain the service, improve the library, fix broken resources, and handle abuse or security concerns.',
  },
  {
    title: 'Account changes',
    body: 'Contact a DP Resources administrator for help with account questions, access issues, or account deletion requests.',
  },
]

function LegalHeader() {
  return (
    <header className="border-b border-[#e5dccd] bg-[#f6f1e8] px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-4">
        <BrandWordmark href="/" className="text-base sm:text-lg" />
        <nav className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-3">
          <Link href="/privacy" className="whitespace-nowrap text-slate-600 hover:text-[#10243f]">Privacy</Link>
          <Link href="/auth/login" className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4">Log in</Link>
        </nav>
      </div>
    </header>
  )
}

export default function TermsPage(){
  return <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
    <LegalHeader />
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-[#e5dccd] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">Terms</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#10243f] sm:text-4xl">Use DP Resources responsibly.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">DP Resources provides free account-based access to a study resource library. By using the platform, you agree to use it fairly, safely, and only for appropriate study or school-related purposes.</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {sections.map((section)=>(
          <article key={section.title} className="rounded-2xl border border-[#e5dccd] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#10243f]">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p>
          </article>
        ))}
      </section>
    </div>
  </main>
}
