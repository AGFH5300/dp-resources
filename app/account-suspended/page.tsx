import type { Metadata } from 'next'
import { BrandWordmark } from '@/components/brand-wordmark'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Account suspended',
  description: 'Your DP Resources account has been suspended.',
  path: '/account-suspended',
})

export default function AccountSuspendedPage() {
  return (
    <main className="min-h-screen bg-[color:var(--dp-warm-surface)] px-4 py-10 text-[#10243f] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col justify-center">
        <BrandWordmark href="/" className="mb-8 text-xl" />
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--dp-blue)]">Account access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dp-navy)] sm:text-4xl">Your account has been suspended.</h1>
          <p className="mt-4 text-base leading-7 text-slate-700">You no longer have access to DP Resources. Contact the site administrator if you believe this is a mistake.</p>
          <form action="/api/auth/signout" method="post" className="mt-8">
            <button className="w-full rounded-md bg-[color:var(--dp-navy)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto" type="submit">Sign out</button>
          </form>
        </section>
      </div>
    </main>
  )
}
