import { Nav } from '@/components/nav';
import { TutorialReplayCard } from '@/components/tutorial/tutorial-replay-card';

export default function LoadingSettings() {
  return (
    <>
      <Nav />
      <main
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
        aria-busy="true"
      >
        <div className="mb-6">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Account
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--dp-navy)] dark:text-slate-100">
            Settings &amp; Account Centre
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage how you sign in, your profile, DP Resources display preferences,
            notifications, and account security.
          </p>
        </div>

        <div className="min-h-40 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="h-5 w-44 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="mt-4 h-20 rounded-lg bg-slate-50 dark:bg-slate-900" />
        </div>

        <div className="mt-6">
          <TutorialReplayCard />
        </div>

        <div className="mt-6 h-56 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" />
        <span className="sr-only">Loading Settings</span>
      </main>
    </>
  );
}
