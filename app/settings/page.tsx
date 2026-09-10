export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { ConnectedAccounts } from '@/components/account/connected-accounts';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { SettingsCentre } from './settings-centre';

export default async function SettingsPage() {
  const { membership } = await requireMember();

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Account
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--dp-navy)] dark:text-slate-100">
            Settings &amp; Account Centre
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage your profile, DP Resources display preferences, notifications, and
            account security.
          </p>
        </div>
        <SettingsCentre />
        <ConnectedAccounts />
      </main>
    </>
  );
}
