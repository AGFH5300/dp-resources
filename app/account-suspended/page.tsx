import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BrandWordmark } from '@/components/brand-wordmark';
import { publicPageMetadata } from '@/lib/seo';
import { getSessionResourceMembership } from '@/lib/supabase';
import {
  ClearSuspensionReasonButton,
  SuspensionReasonFallback,
} from './suspension-reason-fallback';
import { UnsuspensionWatcher } from './unsuspension-watcher';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = publicPageMetadata({
  title: 'Account suspended',
  description: 'Your DP Resources account has been suspended.',
  path: '/account-suspended',
});

export default async function AccountSuspendedPage() {
  const { user, membership } = await getSessionResourceMembership();
  if (user && membership && !membership.is_suspended) redirect('/library');
  const suspensionReason =
    user && membership?.is_suspended ? membership.suspension_reason : null;

  return (
    <main className="min-h-screen bg-[color:var(--dp-warm-surface)] px-4 py-10 text-[#10243f] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col justify-center">
        <div className="mb-8 flex items-center justify-between">
          <BrandWordmark href="/" className="text-xl" />
          <ThemeToggle />
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--dp-blue)]">
            Account access
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dp-navy)] sm:text-4xl">
            Your account has been suspended.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-700">
            You no longer have access to DP Resources. If you believe this is a
            mistake, contact the site administrator at{' '}
            <a
              href="mailto:dxb.avg@gmail.com"
              className="font-semibold text-[color:var(--dp-blue)] hover:underline"
            >
              dxb.avg@gmail.com
            </a>
            .
          </p>
          <SuspensionReasonFallback initialReason={suspensionReason} />
          <UnsuspensionWatcher initialUserId={user?.id ?? null} />
          <form action="/api/auth/signout" method="post" className="mt-8">
            <ClearSuspensionReasonButton className="w-full rounded-md bg-[color:var(--dp-navy)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto" />
          </form>
        </section>
      </div>
    </main>
  );
}
