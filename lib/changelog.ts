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
  '2026-07-22': [
    'Simplified Question Bank headers and repaired breadcrumb navigation between courses, subjects, and the main bank.',
    'Added colourful Question Bank difficulty and progress indicators, instant status feedback, readable image surfaces, and repaired search results.',
    'Rebuilt the Question Bank as an interactive practice workspace with selectable answers, immediate feedback, and in-page explanations.',
    'Improved Question Bank formatting, dark-mode answer interactions, instant answer checking, and private solution-video links.',
    'Added guided review for written responses, including self-assessment and a revisit option.',
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
    'Restored reliable Word document previews and improved Google Sheets and filter controls.',
  ],
  '2026-07-04': [
    'Improved notifications, featured resources, and support and report follow-ups.',
  ],
  '2026-07-02': [
    'Introduced the current DP Resources header, account menu, Library workspace, contextual actions, and details panels.',
    'Improved resource actions, the support centre, global search, filters, and the overall visual design.',
    'Added featured resources, higher-quality document previews, and more reliable notifications.',
    'Improved spreadsheet and Word document previews across desktop and mobile.',
  ],
  '2026-07-01': [
    'Created DP Resources as a dedicated study-resource library.',
    'Added the complete sign-up, verification, login, and password setup experience.',
    'Removed the approval wait so verified users can enter the Library immediately.',
    'Launched global search, previews, saved resources, recent activity, reporting, and support.',
  ],
};

function sentenceFromTitle(title: string) {
  const cleaned = title
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim();
  if (!cleaned) return 'Updated DP Resources.';
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function isUserFacingTitle(title: string) {
  return !/(admin|administrator|migration|deploy|deployment|render\b|supabase|docker|workflow|\bci\b|typecheck|lint|test suite|regression test|dependency|security advisory|database|moderation|audit|analytics|diagnostic|rate limit|background worker|cloudflare r2)/i.test(
    title,
  );
}

function parseMergeCommit(value: GitHubCommit): ChangelogEntry | null {
  if (!Array.isArray(value.parents) || value.parents.length < 2) return null;
  if (typeof value.sha !== 'string') return null;

  const message = value.commit?.message;
  if (typeof message !== 'string') return null;

  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!/^Merge pull request #(\d+) from\s+/i.test(lines[0] || '')) return null;

  const title = lines.slice(1).join(' ').trim();
  if (!isUserFacingTitle(title)) return null;

  const rawDate = value.commit?.committer?.date || value.commit?.author?.date;
  if (typeof rawDate !== 'string' || Number.isNaN(Date.parse(rawDate)))
    return null;

  return {
    id: value.sha,
    summary: sentenceFromTitle(title),
    date: new Date(rawDate).toISOString(),
  };
}

function dateKey(date: string) {
  return new Date(date).toISOString().slice(0, 10);
}

function historicalFallbackEntries() {
  return Object.entries(historicalSummaries)
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([date, summaries]) =>
      summaries.map((summary, index) => ({
        id: `historical-${date}-${index}`,
        summary,
        date: `${date}T12:00:00.000Z`,
      })),
    );
}

function consolidateHistory(entries: ChangelogEntry[]) {
  const byDate = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const key = dateKey(entry.date);
    const current = byDate.get(key) || [];
    current.push(entry);
    byDate.set(key, current);
  }

  const dates = new Set([
    ...byDate.keys(),
    ...Object.keys(historicalSummaries),
  ]);
  return [...dates]
    .sort((left, right) => right.localeCompare(left))
    .flatMap((date) => {
      const summaries = historicalSummaries[date];
      if (summaries) {
        return summaries.map((summary, index) => ({
          id: `historical-${date}-${index}`,
          summary,
          date: `${date}T12:00:00.000Z`,
        }));
      }
      return byDate.get(date) || [];
    });
}

async function fetchCommitPage(page: number): Promise<GitHubCommit[]> {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/commits?sha=main&per_page=${COMMITS_PER_PAGE}&page=${page}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DP-Resources-Changelog',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: REVALIDATE_SECONDS },
    },
  );

  if (!response.ok)
    throw new Error(`GitHub commits request failed with ${response.status}`);

  const value: unknown = await response.json();
  if (!Array.isArray(value))
    throw new Error('GitHub commits response was invalid');
  return value as GitHubCommit[];
}

async function fetchAllMergeCommits() {
  const commits: GitHubCommit[] = [];

  for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
    const next = await fetchCommitPage(page);
    commits.push(...next);
    if (next.length < COMMITS_PER_PAGE) break;
  }

  const unique = new Map<string, ChangelogEntry>();
  for (const commit of commits) {
    const parsed = parseMergeCommit(commit);
    if (parsed) unique.set(parsed.id, parsed);
  }

  return consolidateHistory([...unique.values()]);
}

export async function getChangelog(): Promise<ChangelogResult> {
  try {
    const entries = await fetchAllMergeCommits();
    if (!entries.length) throw new Error('No merged updates were returned');
    return { entries, source: 'github' };
  } catch (error) {
    console.error('Unable to refresh the public changelog from GitHub.', error);
    return { entries: historicalFallbackEntries(), source: 'fallback' };
  }
}
