import 'server-only';

const REPOSITORY = 'AGFH5300/dp-resources';
const COMMITS_PER_PAGE = 100;
const MAX_COMMIT_PAGES = 10;
const REVALIDATE_SECONDS = 60 * 60;

export type ChangelogEntry = {
  id: string;
  summary: string;
  date: string;
};

export type ChangelogResult = {
  entries: ChangelogEntry[];
  source: 'github' | 'fallback';
};

type GitHubCommit = {
  sha?: unknown;
  commit?: {
    message?: unknown;
    committer?: { date?: unknown } | null;
    author?: { date?: unknown } | null;
  } | null;
  parents?: Array<{ sha?: unknown }>;
};

const historicalSummaries: Record<string, string[]> = {
  '2026-07-23': [
    'Expanded the Question Bank with audited PESTLE questions across 14 subjects, including topic and subtopic browsing, markschemes, examiner reports, and private diagrams.',
    'Improved question metadata so unavailable marks are identified clearly instead of being estimated.',
    'Made Question Bank filters compact and instant, added searchable topic menus and question reporting, and linked formula booklets to the native Library.',
    'Polished recent-question cards, added subject-specific icons, clarified older course collections, consolidated review flags into Saved questions, and improved markscheme formatting.',
    'Improved the ESS subject icon, added final-assessment years to old-course labels, and connected native Biology, Business Management, and Chemistry reference booklets to Question Bank practice.',
  ],
  '2026-07-22': [
    'Simplified Question Bank headers and repaired breadcrumb navigation between courses, subjects, and the main bank.',
    'Added colourful Question Bank difficulty and progress indicators, instant status feedback, readable image surfaces, and repaired search results.',
    'Rebuilt the Question Bank as an interactive practice workspace with selectable answers, immediate feedback, and in-page explanations.',
    'Improved Question Bank formatting, dark-mode answer interactions, instant answer checking, and private solution-video links.',
    'Added guided self-assessment and progress tracking for written responses.',
    'Improved topic and subtopic filtering with custom menus, clearer dark-mode selection, and question search across every subject.',
  ],
  '2026-07-21': [
    'Added password recovery with secure reset emails, password-strength guidance, password matching, and quick links to popular mail apps.',
    'Suspended accounts now open a dedicated page that clearly explains the suspension reason and how to contact the support team.',
    'Added notification badges for new support tickets and resource reports, plus user alerts when a ticket receives a reply or status update.',
    'Fixed password-reset links so they reliably return to the public DP Resources website.',
  ],
  '2026-07-18': [
    'Fixed dropdown menus so selected and highlighted options remain clear and readable in dark mode.',
    'Softened dark-mode borders and improved the readability of disabled and loading account buttons.',
    'Added matching search-term highlights to the complete search results page.',
    'Made Recent resources consistent across search, saved links, direct links, folders, and devices.',
  ],
  '2026-07-17': [
    'Added Light, Dark, and System appearance options, with the selected preference remembered across visits.',
    'Updated the DP Resources wordmark and logo so they remain clear and consistent on dark backgrounds.',
    'Improved PDF and presentation loading screens with clearer progress indicators in dark mode.',
    'Refined global search hover states, selections, and borders for a calmer and more consistent dark-mode experience.',
  ],
  '2026-07-15': [
    'Expanded instant PDF loading to every large PDF currently available in the Library.',
    'Fixed regular PDFs so smaller documents continue to open reliably in the standard reader.',
    'Fixed prepared books incorrectly opening in the slower reader or failing to display.',
    'Very long books with more than 1,000 pages now load completely and support direct page jumps.',
    'Search highlighting, annotations, zoom, rotation, print, and download remain available throughout the instant reader.',
  ],
  '2026-07-14': [
    'Large textbooks and other prepared PDFs now open much faster without waiting for the complete file to download.',
    'Added a complete PDF toolbar with page entry, zoom, fit, rotation, print, download, fullscreen, and annotation tools.',
    'PDF search now highlights exact words and phrases and scrolls directly to the selected match.',
    'Improved PDF reliability across very large books, different page formats, repeated searches, and navigation changes.',
    'Added this public changelog so improvements and fixes are easier to follow.',
  ],
  '2026-07-13': [
    'Made large PDFs load more smoothly with continuous scrolling and nearby-page loading.',
    'Improved the reliability of opening, retrying, and moving through long documents.',
  ],
  '2026-07-12': [
    'Made PowerPoint previews safer and more reliable for large presentations.',
    'Improved slide navigation, embedded audio, loading progress, file-size information, and time estimates.',
    'Fixed duplicate slides and several visual preview glitches.',
  ],
  '2026-07-10': [
    'Improved sign-up reliability while reducing temporary-email abuse.',
    'Added clearer account-access messages and faster updates when access changes.',
    'Improved notification readability across the site.',
  ],
  '2026-07-07': [
    'Improved Library action menus and made folder-size information more accurate.',
    'Expanded previews for audio, video, spreadsheets, presentations, documents, and other resource types.',
    'Improved search accuracy, extension matching, navigation speed, and no-results messages.',
    'Added clearer username availability messages and clickable resource breadcrumbs.',
  ],
  '2026-07-06': [
    'Improved the Google Sheets preview and simplified the workbook experience.',
    'Added support conversations so replies and follow-ups can stay together.',
    'Made Library navigation and resource indexing faster and more dependable.',
  ],
  '2026-07-05': [
    'Added structured subject folders, formula and data booklets, specimen papers, guides, grade boundaries, and combined past-paper packs.',
  ],
};

function commitSummary(message: unknown) {
  return String(message || '')
    .split('\n')[0]
    .replace(/^Merge pull request #\d+ from [^ ]+\s*/i, '')
    .trim();
}

function meaningfulCommit(commit: GitHubCommit) {
  return (commit.parents?.length || 0) <= 1;
}

function displayDate(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function fallbackEntries() {
  return Object.entries(historicalSummaries).flatMap(([date, summaries]) =>
    summaries.map((summary, index) => ({
      id: `fallback-${date}-${index}`,
      summary,
      date,
    })),
  );
}

export async function getChangelog(): Promise<ChangelogResult> {
  const entries: ChangelogEntry[] = [];
  try {
    for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/commits?per_page=${COMMITS_PER_PAGE}&page=${page}`,
        {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'dp-resources-changelog',
          },
          next: { revalidate: REVALIDATE_SECONDS },
        },
      );
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const commits = (await response.json()) as GitHubCommit[];
      for (const commit of commits) {
        if (!meaningfulCommit(commit)) continue;
        const summary = commitSummary(commit.commit?.message);
        const date = displayDate(
          commit.commit?.committer?.date || commit.commit?.author?.date,
        );
        if (!commit.sha || !summary || !date) continue;
        entries.push({ id: String(commit.sha), summary, date });
      }
      if (commits.length < COMMITS_PER_PAGE) break;
    }
    if (!entries.length) throw new Error('No changelog commits were returned.');
    return { entries, source: 'github' };
  } catch {
    return { entries: fallbackEntries(), source: 'fallback' };
  }
}
