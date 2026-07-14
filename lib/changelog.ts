import 'server-only'

const REPOSITORY = 'AGFH5300/dp-resources'
const COMMITS_PER_PAGE = 100
const MAX_COMMIT_PAGES = 10
const REVALIDATE_SECONDS = 60 * 60

export type ChangelogEntry = {
  id: string
  summary: string
  date: string
}

export type ChangelogResult = {
  entries: ChangelogEntry[]
  source: 'github' | 'fallback'
}

type GitHubCommit = {
  sha?: unknown
  commit?: {
    message?: unknown
    committer?: { date?: unknown } | null
    author?: { date?: unknown } | null
  } | null
  parents?: Array<{ sha?: unknown }>
}

const historicalSummaries: Record<string, string[]> = {
  '2026-07-14': [
    'Large textbooks and other prepared PDFs now open almost instantly through private page-based previews stored in Supabase or Cloudflare R2.',
    'Added a complete PDF toolbar with direct page entry, zoom, fit, rotation, print, download, fullscreen, and browser-local annotation tools.',
    'PDF search now supports exact word and phrase highlighting, repeated matches, large textbooks, and automatic scrolling to the highlighted occurrence.',
    'Improved preview preparation with controlled batches, retry and resume support, storage safeguards, reliable version matching, and broader PDF page-size compatibility.',
    'Fixed PDF page drift during navigation and layout changes, stale search readiness, and invisible page-number or search input text.',
    'Added a public changelog with dated, plain-language summaries of released improvements and fixes.',
  ],
  '2026-07-13': [
    'Improved large-PDF loading with authenticated preview sessions, safer byte-range handling, continuous scrolling, lazy rendering, and better image decoding support.',
    'Strengthened large-PDF request limits and activity tracking so repeated range requests do not create duplicate open events.',
  ],
  '2026-07-12': [
    'Moved PowerPoint previews into the browser so large presentations cannot overload or crash the web server.',
    'Improved presentation cleanup, embedded-audio handling, slide navigation, progress reporting, file-size display, and download time estimates.',
    'Fixed duplicate slides, renderer artefacts, and related preview lifecycle issues.',
  ],
  '2026-07-10': [
    'Added disposable-email protection while keeping legitimate sign-ups immediate and free from a manual approval queue.',
    'Added administrator account suspension with private reasons, optional domain blocking, audit records, and safer allowed-domain handling.',
    'Suspended and restored accounts now update in near real time, including automatic return to the library after access is restored.',
    'Improved suspension messaging, administrator controls, privacy boundaries, and notification contrast.',
  ],
  '2026-07-09': [
    'Strengthened resource-usage tracking so membership and Drive-root access are verified before sessions begin.',
    'Restored reliable not-found responses and corrected a protected-path regression in the test suite.',
  ],
  '2026-07-08': [
    'Added and hardened Docker-based Render deployment, including production configuration and build fixes.',
    'Expanded administrator usage analytics with friendly file types, resource actions, detailed modals, and per-user breakdowns.',
    'Added persistent diagnostics, platform housekeeping, session protections, and safer analytics retention.',
    'Made close controls accessible and kept them visible in long administrator panels and modals.',
  ],
  '2026-07-07': [
    'Unified Library action menus across list and grid views, prevented viewport clipping, and added accurate indexed folder-size summaries.',
    'Expanded secure previews for audio, video, spreadsheets, presentations, documents, and other indexed file types.',
    'Improved global search accuracy, extension matching, request cancellation, navigation speed, and no-results messaging.',
    'Added server-side identity moderation, clearer username availability messages, clickable resource breadcrumbs, and stronger API request protections.',
    'Added production diagnostics, privacy and terms pages, and resource usage analytics for platform improvement.',
  ],
  '2026-07-06': [
    'Improved and simplified the protected Google Sheets master-workbook preview.',
    'Added support ticket conversations, administrator replies, internal notes, and reusable administrator email search.',
    'Made Library navigation and the Google Drive index faster, resumable, and safer for large folders.',
    'Removed confusing external resource actions and corrected deployment migration ordering.',
    'Resolved a PostCSS security advisory without changing application behaviour.',
  ],
  '2026-07-05': [
    'Restored reliable DOCX previews, added the protected Google Sheets embed, and standardised selects and live administrator filters.',
  ],
  '2026-07-04': [
    'Added production-ready notifications, protected workbook previews, permanent featured resources, and administrator operations queues.',
    'Rebuilt the administrator area into a focused operations console with persistent report and support workflows.',
  ],
  '2026-07-02': [
    'Made the Google Drive index resumable and safe for large libraries, with clearer administrator progress and recovery controls.',
    'Introduced the current DP Resources header, account menu, Drive-style Library workspace, contextual actions, and details panels.',
    'Completed the main resource actions, support centre, global search interface, filters, and DP Resources visual styling.',
    'Added featured resources, higher-fidelity document previews, improved notifications, and stronger index recovery.',
    'Improved spreadsheet and DOCX reliability and refined the signed-in experience across desktop and mobile.',
  ],
  '2026-07-01': [
    'Created DP Resources and replaced the initial prototype with the production Supabase and Google Drive architecture.',
    'Hardened authentication, protected Drive access, server-side streaming, administrator permissions, and deployment security.',
    'Separated DP Resources data from MYP Atlas while continuing to share the same secure user accounts.',
    'Introduced the complete DP Resources sign-up, OTP verification, login, and password setup experience.',
    'Removed the approval wait so verified users can enter the library immediately.',
    'Launched the Drive-style resource workspace with global search, previews, saved resources, recent activity, reporting, and support.',
  ],
}

function sentenceFromTitle(title: string) {
  const cleaned = title.replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim()
  if (!cleaned) return 'Updated DP Resources.'
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`
}

function parseMergeCommit(value: GitHubCommit): ChangelogEntry | null {
  if (!Array.isArray(value.parents) || value.parents.length < 2) return null
  if (typeof value.sha !== 'string') return null

  const message = value.commit?.message
  if (typeof message !== 'string') return null

  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!/^Merge pull request #(\d+) from\s+/i.test(lines[0] || '')) return null

  const title = lines.slice(1).join(' ').trim()
  const rawDate = value.commit?.committer?.date || value.commit?.author?.date
  if (typeof rawDate !== 'string' || Number.isNaN(Date.parse(rawDate))) return null

  return {
    id: value.sha,
    summary: sentenceFromTitle(title),
    date: new Date(rawDate).toISOString(),
  }
}

function dateKey(date: string) {
  return new Date(date).toISOString().slice(0, 10)
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
    )
}

function consolidateHistory(entries: ChangelogEntry[]) {
  const byDate = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) {
    const key = dateKey(entry.date)
    const current = byDate.get(key) || []
    current.push(entry)
    byDate.set(key, current)
  }

  const dates = new Set([...byDate.keys(), ...Object.keys(historicalSummaries)])
  return [...dates]
    .sort((left, right) => right.localeCompare(left))
    .flatMap((date) => {
      const summaries = historicalSummaries[date]
      if (summaries) {
        return summaries.map((summary, index) => ({
          id: `historical-${date}-${index}`,
          summary,
          date: `${date}T12:00:00.000Z`,
        }))
      }
      return byDate.get(date) || []
    })
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
  )

  if (!response.ok) throw new Error(`GitHub commits request failed with ${response.status}`)

  const value: unknown = await response.json()
  if (!Array.isArray(value)) throw new Error('GitHub commits response was invalid')
  return value as GitHubCommit[]
}

async function fetchAllMergeCommits() {
  const commits: GitHubCommit[] = []

  for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
    const next = await fetchCommitPage(page)
    commits.push(...next)
    if (next.length < COMMITS_PER_PAGE) break
  }

  const unique = new Map<string, ChangelogEntry>()
  for (const commit of commits) {
    const parsed = parseMergeCommit(commit)
    if (parsed) unique.set(parsed.id, parsed)
  }

  return consolidateHistory([...unique.values()])
}

export async function getChangelog(): Promise<ChangelogResult> {
  try {
    const entries = await fetchAllMergeCommits()
    if (!entries.length) throw new Error('No merged updates were returned')
    return { entries, source: 'github' }
  } catch (error) {
    console.error('Unable to refresh the public changelog from GitHub.', error)
    return { entries: historicalFallbackEntries(), source: 'fallback' }
  }
}
