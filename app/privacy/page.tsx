import Link from 'next/link'
import type { Metadata } from 'next'
import { BrandWordmark } from '@/components/brand-wordmark'
import { publicPageMetadata } from '@/lib/seo'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = publicPageMetadata({
  title: 'Privacy Policy',
  description: 'How DP Resources handles account details, resource usage analytics, support messages, and privacy-related requests.',
  path: '/privacy',
})

const sections = [
  {
    title: 'What DP Resources stores',
    body: 'We store the account details needed to run the platform, including your email, username, display name, saved resources, support messages, resource reports, and basic resource usage records.',
  },
  {
    title: 'Resource usage analytics',
    body: 'When you open or download a resource, DP Resources may record the file, the account used, the time of access, and active viewing duration. This helps maintain the library, understand which resources are useful, and investigate broken links or abuse.',
  },
  {
    title: 'What we do not record',
    body: 'DP Resources does not record keystrokes, screenshots, screen recordings, cursor paths, browser activity outside DP Resources, or exact scroll trails.',
  },
  {
    title: 'Admin access',
    body: 'Platform administrators can review account, support, report, saved-resource, and usage data for maintenance, security, abuse prevention, and platform improvement.',
  },
  {
    title: 'Account help and deletion',
    body: 'You can contact a DP Resources administrator to ask privacy questions, request account help, or request account deletion.',
  },
]

function LegalHeader() {
  return (
    <header className="border-b border-[#e5dccd] bg-[#f6f1e8] px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-4">
        <BrandWordmark href="/" className="text-base sm:text-lg" />
        <nav className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-3">
          <ThemeToggle />
          <Link href="/terms" className="hidden whitespace-nowrap text-slate-600 hover:text-[#10243f] sm:inline">Terms</Link>
          <Link href="/auth/login" className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4">Log in</Link>
        </nav>
      </div>
    </header>
  )
}

export default function PrivacyPage(){
  return <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
    <LegalHeader />
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-[#e5dccd] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">Privacy</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#10243f] sm:text-4xl">Clear, limited platform records.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">DP Resources is a free study resource platform. Users need an account so the platform can save preferences, manage support requests, and keep the library reliable. The platform keeps only the records needed to operate the library, support users, and improve resources.</p>
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
