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
    id: 'release-2026-09-03-admin-activity-user-links',
    summary:
      'Made user emails in Admin Activity clickable so admins can open the existing user resource-analytics view directly without losing their current Activity filters or page.',
    date: '2026-09-03T05:55:24.000Z',
  },
  {
    id: 'release-2026-09-03-security-low-findings',
    summary:
      'Strengthened site security with safer error handling, tighter browser script protections, a non-root production runtime, and pinned build automation dependencies.',
    date: '2026-09-03T05:55:16.000Z',
  },
  {
    id: 'release-2026-09-03-library-proactive-loading',
    summary:
      'Made the Resource Library feel much faster by warming the Library before it is opened, preloading likely next folders in the background, and showing an immediate compact loading state instead of leaving users wondering whether a click worked.',
    date: '2026-09-03T05:20:00.000Z',
  },
  {
    id: 'release-2026-09-03-library-hydration-reliability',
    summary:
      'Fixed an intermittent first-load Library failure caused by server and browser date rendering differences, and reduced folder wait time with cached indexed folder views and parallel metadata loading.',
    date: '2026-09-03T04:55:00.000Z',
  },
  {
    id: 'release-2026-08-24-question-bank-topic-dedupe',
    summary:
      'Fixed duplicate Question Bank topics and subtopics across subjects by normalizing provider and syllabus prefixes consistently, including coded and lettered topic labels.',
    date: '2026-08-24T09:16:00.000Z',
  },
  {
    id: 'release-2026-08-24-question-bank-dark-search',
    summary:
      'Fixed the Question Bank course search field in dark mode so it uses the themed search surface instead of showing a white inner input.',
    date: '2026-08-24T09:08:00.000Z',
  },
  {
    id: 'release-2026-08-16-library-source-folders',
    summary:
      'Fixed Library source browsing so normal subject, level, assessment, and navigation folders no longer appear as Source under review, while reviewed source labels such as Padlet remain attached to the actual resources they describe.',
    date: '2026-08-16T00:45:00.000Z',
  },
  {
    id: 'release-2026-08-16-library-folder-header',
    summary:
      'Made Library folder headers more compact by keeping Back navigation and Browse by source together beside the folder controls, removing the awkward empty space between the folder heading and its contents.',
    date: '2026-08-16T00:12:00.000Z',
  },
  {
    id: 'release-2026-08-16-whats-new-final',
    summary:
      'Refreshed What’s new with the final 16 August release highlights, an exact release date, and a new once-per-release prompt while keeping the full changelog available for detailed updates.',
    date: '2026-08-16T00:10:00.000Z',
  },
  {
    id: 'release-2026-08-15-library-folder-controls',
    summary:
      'Improved folder controls in the Resource Library by grouping Search this folder and Filter with the view controls, and making Filter close naturally when clicking elsewhere or pressing Escape.',
    date: '2026-08-15T15:50:00.000Z',
  },
  {
    id: 'release-2026-08-15-maths-search-aliases',
    summary:
      'Made Question Bank Maths searches understand common AA and AI shorthand such as Math AAHL, AA/HL, Maths AI SL, and IB Mathematics AA HL, with exact course matching.',
    date: '2026-08-15T13:58:00.000Z',
  },
  {
    id: 'release-2026-08-15-live-library-index',
    summary:
      'Rebuilt the Admin Library index into a live command center with real progress, current activity, throughput, ETA, safe pause and resume, and resumable refreshes.',
    date: '2026-08-15T12:30:00.000Z',
  },
  {
    id: 'release-2026-08-15-faster-library-index',
    summary:
      'Made Library indexing substantially faster and smoother, refined its dark-mode dashboard, and made completed runs report their true duration and whole-run average speed.',
    date: '2026-08-15T12:20:00.000Z',
  },
  {
    id: 'release-2026-08-14-security-hardening',
    summary:
      'Strengthened sign-in sessions and HTTPS transport, tightened search, support, report, and saved-resource input handling, and preserved the full Library search result capacity.',
    date: '2026-08-14T15:30:00.000Z',
  },
  {
    id: 'release-2026-08-14-qb-search-performance',
    summary:
      'Made Question Bank global search more reliable and responsive, including faster reference lookup and graceful timeout handling.',
    date: '2026-08-14T15:20:00.000Z',
  },
  {
    id: 'release-2026-08-13-source-clarity',
    summary:
      'Added visible Question Bank source summaries and filters, clearer Library attribution, consistent app dropdowns, and improved source review tools.',
    date: '2026-08-13T12:00:00.000Z',
  },
  {
    id: 'release-2026-08-13-whats-new',
    summary:
      'Added a once-per-release What’s new dialog that can be reopened from the account menu, with a clear release date and a direct link to the full changelog.',
    date: '2026-08-13T11:45:00.000Z',
  },
  {
    id: 'release-2026-08-13-library-toolbar',
    summary:
      'Restored compact Library folder rows, hid source labels when no reviewed attribution applies, and moved Search this folder beside Filter to remove wasted space.',
    date: '2026-08-13T11:30:00.000Z',
  },
  {
    id: 'release-2026-08-12-source-review-security',
    summary:
      'Completed the Library source and resource-type review so reviewed attribution is used consistently and structural folders are treated as Library structure rather than unknown content.',
    date: '2026-08-12T14:30:00.000Z',
  },
  {
    id: 'release-2026-08-12-frontend-secret-boundary',
    summary:
      'Moved browser data access behind same-origin server routes, removed browser-exposed API-key dependencies, and added automatic client-bundle secret checks.',
    date: '2026-08-12T14:20:00.000Z',
  },
  {
    id: 'release-2026-08-11-qb-source-theme-fixes',
    summary:
      'Fixed Question Bank dark-mode handling and source filters, improved Caps Lock refocus detection, and corrected source attribution using verified archive evidence.',
    date: '2026-08-11T14:58:37.000Z',
  },
  {
    id: 'release-2026-08-08-caps-lock',
    summary:
      'Added an accessible Caps Lock indicator inside the sign-in password field with a subtle helper message while Caps Lock is active.',
    date: '2026-08-08T08:35:58.000Z',
  },
  {
    id: 'release-2026-08-08-library-source-evidence',
    summary:
      'Expanded reviewed Library source attribution across Official IB, Save My Exams, RevisionDojo, Christos Nikolaidis, Brilliant Learning, school resources, Padlet, and DP Resources.',
    date: '2026-08-08T08:30:00.000Z',
  },
  {
    id: 'release-2026-08-07-source-rollout-hardening',
    summary:
      'Hardened source attribution so saved-question filtering and public source labels consistently use reviewed source data while unresolved provider names stay neutral.',
    date: '2026-08-07T17:29:42.000Z',
  },
  {
    id: 'release-2026-08-06-unified-sources',
    summary:
      'Added unified content-source attribution across the Question Bank and Resource Library, including source badges, filters, source browsing, Practice Builder source persistence, and review tools.',
    date: '2026-08-06T16:42:19.000Z',
  },
  {
    id: 'release-2026-08-06-library-source-metadata',
    summary:
      'Added reviewed Library source and resource-type metadata with inheritance and overrides while keeping the underlying Google Drive files unchanged.',
    date: '2026-08-06T16:40:00.000Z',
  },
  {
    id: 'release-2026-08-05-local-device-practice',
    summary:
      'Moved ordinary Practice Builder sessions to a more reliable flow, added automatic cleanup, and kept exact question queues limited to deliberate sharing.',
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
  const curatedDates = new Set(
    latestReleaseNotes.map((entry) => entry.date.slice(0, 10)),
  );

  return [
    ...latestReleaseNotes,
    ...entries.filter(
      (entry) =>
        !curatedDates.has(entry.date.slice(0, 10)) &&
        !latestSummaries.has(entry.summary),
    ),
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
