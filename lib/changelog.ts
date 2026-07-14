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

const summaryOverrides: Record<number, string> = {
  89: 'PDF search now scrolls directly to the highlighted word and cycles through individual matches on the page.',
  88: 'Fixed PDF search readiness and made page-number and search text clearly visible while typing.',
  87: 'Added exact word and phrase highlighting to searchable PDF previews.',
  85: 'Fixed preview preparation for PDFs that label page sizes such as A4 or Letter.',
  84: 'Kept the current PDF page stable when jumping, zooming, fitting, or rotating.',
  83: 'Added a complete PDF toolbar with direct page entry, search, annotations, print, download, rotation, and fullscreen.',
  82: 'Added private Cloudflare R2 storage and controlled batch preparation for large textbooks.',
  81: 'Fixed preview version matching so existing prepared PDFs are reused reliably.',
  80: 'Made large PDF preparation faster and more resilient with concurrent uploads, retries, and resume support.',
  79: 'Added a GitHub Actions workflow to prepare PDF previews on the free hosting setup.',
  78: 'Introduced instant-loading, page-based previews for very large PDFs.',
  77: 'Replaced the slow custom PDF reader with the browser reader while the new preview system was being prepared.',
  71: 'Fixed presentation file-size and time-remaining calculations.',
  70: 'Added presentation file size and an honest download time estimate.',
  69: 'Fixed presentation progress, duplicate slides, renderer artefacts, and favicon errors.',
  68: 'Strengthened browser-based PowerPoint previews and removed unsafe server conversion.',
  67: 'Moved PowerPoint previews into the browser to protect the website from large conversion jobs.',
  66: 'Suspended accounts now return to the library automatically when an administrator restores access.',
  64: 'Improved suspension messages, domain-block controls, and notification contrast.',
  59: 'Added disposable-email blocking and account suspension without introducing a manual approval queue.',
  56: 'Fixed the production Next.js configuration used by Render.',
  54: 'Added Docker-based deployment support for Render.',
  53: 'Made close controls consistent, accessible, and sticky in long admin panels.',
  52: 'Moved detailed resource usage statistics into a compact modal.',
  51: 'Improved resource usage analytics with clearer file types and direct actions.',
  50: 'Strengthened resource usage analytics, session limits, cleanup, and admin protections.',
  49: 'Added production diagnostics, privacy and terms pages, and resource usage analytics.',
  48: 'Improved username availability messages, added clickable resource breadcrumbs, and strengthened API security.',
  43: 'Improved search reliability and presentation previews.',
  42: 'Rebuilt global search, media seeking, and the protected presentation preview pipeline.',
  41: 'Fixed audio and video seeking, reset search cleanly, and improved preview interactions.',
  40: 'Expanded previews for saved files, audio, video, spreadsheets, presentations, and other resource types.',
  39: 'Fixed library context menus near screen edges and made folder-size totals accurate.',
  38: 'Unified library action menus and added estimated folder sizes.',
  35: 'Made the Google Drive library index faster, resumable, and safer for large folders.',
  32: 'Made library navigation faster with indexed browsing and improved protected preview caching.',
  30: 'Fixed support submission feedback and added ticket conversations plus admin user search.',
  26: 'Improved the master workbook preview, simplified the account menu, and strengthened dependency security.',
  25: 'Restored DOCX previews, added the Google Sheets embed, and standardised selects and admin filters.',
  23: 'Added production-ready notifications, workbook previews, admin queues, and search polish.',
  20: 'Redesigned search, added featured resources, improved document previews, and strengthened index recovery.',
  17: 'Introduced the current DP Resources header, account menu, and modern resource layouts.',
  16: 'Redesigned the library as a calm, Drive-style workspace with contextual actions and a details panel.',
  15: 'Completed the main resource actions, support centre, filters, and DP Resources visual styling.',
  12: 'Launched the Drive-style resource workspace with global search, previews, saved resources, recent activity, and support.',
  11: 'Removed the approval wait so verified users can enter the library immediately.',
  8: 'Introduced the complete DP Resources sign-up, OTP verification, login, and password setup experience.',
  4: 'Separated DP Resources data from MYP Atlas while continuing to share the same secure user accounts.',
  2: 'Replaced the prototype with the production Supabase and Google Drive architecture.',
  1: 'Created the first DP Resources portal prototype.',
}

const fallbackEntries: ChangelogEntry[] = [
  {
    id: '81ef3aeb05bb98d83633a2a46db47eedd617efa3',
    summary: summaryOverrides[89],
    date: '2026-07-14T22:03:15Z',
  },
  {
    id: '94fe7c27b8a6a10ea3162f816d1813b0614829f8',
    summary: summaryOverrides[88],
    date: '2026-07-14T21:47:43Z',
  },
  {
    id: 'd7f22c7d51e9b126178cbdd3241bf8e69a43376f',
    summary: summaryOverrides[87],
    date: '2026-07-14T20:25:32Z',
  },
  {
    id: '5c07b2971741466a1c0a30f092f310a6fd6e4817',
    summary: summaryOverrides[84],
    date: '2026-07-14T19:07:40Z',
  },
  {
    id: '13414e49ce360a461ca2f957c3d0cc28a2f52d01',
    summary: summaryOverrides[83],
    date: '2026-07-14T17:21:42Z',
  },
  {
    id: 'f5cc956ec39d88f5c7a450087501e0894ae60a38',
    summary: summaryOverrides[82],
    date: '2026-07-14T15:51:58Z',
  },
]

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
  const merge = /^Merge pull request #(\d+) from\s+/i.exec(lines[0] || '')
  if (!merge) return null

  const pullRequest = Number(merge[1])
  if (!Number.isSafeInteger(pullRequest) || pullRequest < 1) return null

  const title = lines.slice(1).join(' ').trim()
  const rawDate = value.commit?.committer?.date || value.commit?.author?.date
  if (typeof rawDate !== 'string' || Number.isNaN(Date.parse(rawDate))) return null

  return {
    id: value.sha,
    summary: summaryOverrides[pullRequest] || sentenceFromTitle(title),
    date: new Date(rawDate).toISOString(),
  }
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

  return [...unique.values()].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
}

export async function getChangelog(): Promise<ChangelogResult> {
  try {
    const entries = await fetchAllMergeCommits()
    if (!entries.length) throw new Error('No merged updates were returned')
    return { entries, source: 'github' }
  } catch (error) {
    console.error('Unable to refresh the public changelog from GitHub.', error)
    return { entries: fallbackEntries, source: 'fallback' }
  }
}
