import type { Metadata } from 'next'
import { Nav } from '@/components/nav'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Terms of Use',
  description: 'Terms for using DP Resources, including account use, protected resource access, reports, support, and platform records.',
  path: '/terms',
})

const sections = [
  {
    title: 'Account use',
    body: 'Use your own account only. Do not share login details, OTP codes, passwords, or protected resource links with people who should not have access.',
  },
  {
    title: 'Resource access',
    body: 'Resources are provided through the DP Resources portal for study and school-related use. Do not misuse, mass-download, redistribute, or publicly repost protected resources.',
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

export default function TermsPage(){
  return <>
    <Nav/>
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--dp-blue)]">Terms</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dp-navy)] sm:text-4xl">Use DP Resources responsibly.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">DP Resources provides account-based access to a protected school resource library. By using the platform, you agree to use it fairly, safely, and only for appropriate study or school-related purposes.</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {sections.map((section)=>(
          <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[color:var(--dp-navy)]">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  </>
}
