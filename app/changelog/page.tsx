import Link from 'next/link';
import type { Metadata } from 'next';
import { BrandWordmark } from '@/components/brand-wordmark';
import { ChangelogList } from './changelog-list';
import { getChangelog, type ChangelogEntry } from '@/lib/changelog';
import { publicPageMetadata } from '@/lib/seo';
import { ThemeToggle } from '@/components/theme-toggle';

export const revalidate = 3600;

export const metadata: Metadata = publicPageMetadata({
  title: 'Changelog',
  description:
    'A dated record of new features, improvements, and fixes released to DP Resources.',
  path: '/changelog',
});

const latestReleaseNotes: ChangelogEntry[] = [
  {
    id: 'release-2026-08-05-local-device-practice',
    summary:
      'Moved ordinary Practice Builder sessions and their position to the current browser, added automatic local cleanup and device deletion, and keeps exact queues online only when a user deliberately shares them.',
    date: '2026-08-05T14:42:11.000Z',
  },
  {
    id: 'release-2026-08-05-storage-cleanup',
    summary:
      'Reduced Question Bank storage use, kept search responsive, and added automatic cleanup for interrupted or abandoned practice builds.',
    date: '2026-08-05T13:36:26.000Z',
  },
  {
    id: 'release-2026-08-04-recent-card-overflow',
    summary:
      'Fixed long Question Bank references and course names so Continue Practising and recent-question cards stay contained instead of overflowing.',
    date: '2026-08-04T16:13:08.000Z',
  },
];

function includeLatestReleaseNotes(entries: ChangelogEntry[]) {
  const latestSummaries = new Set(
    latestReleaseNotes.map((entry) => entry.summary),
  );

  return [
    ...latestReleaseNotes,
    ...entries.filter((entry) => !latestSummaries.has(entry.summary)),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

export default async function ChangelogPage() {
  const { entries: history } = await getChangelog();
  const entries = includeLatestReleaseNotes(history);

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
      <header className="border-b border-[#e5dccd] bg-[#f6f1e8] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-4">
          <BrandWordmark href="/" className="text-base sm:text-lg" />
          <nav
            className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-4"
            aria-label="Changelog navigation"
          >
            <ThemeToggle />
            <Link
              href="/privacy"
              className="hidden whitespace-nowrap text-slate-600 hover:text-[#10243f] sm:inline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hidden whitespace-nowrap text-slate-600 hover:text-[#10243f] sm:inline"
            >
              Terms
            </Link>
            <Link
              href="/library"
              className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4"
            >
              Open library
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">
            DP Resources
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#10243f] sm:text-5xl">
            Changelog
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            A listed record of all the features, improvements, and fixes
            released to the website.
          </p>
        </section>

        <ChangelogList entries={entries} />
      </div>
    </main>
  );
}
