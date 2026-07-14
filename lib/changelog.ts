import 'server-only'

const REPOSITORY = 'AGFH5300/dp-resources'
const COMMITS_PER_PAGE = 100
const MAX_COMMIT_PAGES = 10
const REVALIDATE_SECONDS = 60 * 60

export type ChangelogCategory = 'New' | 'Improved' | 'Fixed' | 'Security' | 'Infrastructure'

export type ChangelogEntry = {
  sha: string
  shortSha: string
  title: string
  date: string
  url: string
  pullRequest: number
  category: ChangelogCategory
}

export type ChangelogResult = {
  entries: ChangelogEntry[]
  source: 'github' | 'fallback'
}

type GitHubCommit = {
  sha?: unknown
  html_url?: unknown
  commit?: {
    message?: unknown
    committer?: { date?: unknown } | null
    author?: { date?: unknown } | null
  } | null
  parents?: Array<{ sha?: unknown }>
}

const fallbackEntries: ChangelogEntry[] = [
  {
    sha: '81ef3aeb05bb98d83633a2a46db47eedd617efa3',
    shortSha: '81ef3ae',
    title: 'Focus PDF search on the actual highlighted word',
    date: '2026-07-14T22:03:15Z',
    url: 'https://github.com/AGFH5300/dp-resources/commit/81ef3aeb05bb98d83633a2a46db47eedd617efa3',
    pullRequest: 89,
    category: 'Improved',
  },
  {
    sha: '94fe7c27b8a6a10ea3162f816d1813b0614829f8',
    shortSha: '94fe7c2',
    title: 'Fix PDF search readiness and toolbar input visibility',
    date: '2026-07-14T21:47:43Z',
    url: 'https://github.com/AGFH5300/dp-resources/commit/94fe7c27b8a6a10ea3162f816d1813b0614829f8',
    pullRequest: 88,
    category: 'Fixed',
  },
  {
    sha: 'd7f22c7d51e9b126178cbdd3241bf8e69a43376f',
    shortSha: 'd7f22c7',
    title: 'Highlight exact PDF search words and phrases',
    date: '2026-07-14T20:25:32Z',
    url: 'https://github.com/AGFH5300/dp-resources/commit/d7f22c7d51e9b126178cbdd3241bf8e69a43376f',
    pullRequest: 87,
    category: 'New',
  },
]

function categoryForTitle(title: string): ChangelogCategory {
  const value = title.toLocaleLowerCase()

  if (/security|auth|permission|rls|privacy|suspension|disposable|rate limit|csrf|moderation/.test(value)) {
    return 'Security'
  }

  if (/render|docker|deployment|build|ci\b|migration|supabase|storage|cloudflare|r2\b|workflow|dependency|postcss|node\b|index crawler/.test(value)) {
    return 'Infrastructure'
  }

  if (/^(add|create|introduce|implement|highlight|resource workspace|production readiness|quality pass)/.test(value)) {
    return 'New'
  }

  if (/^(fix|repair|restore|prevent|stop|correct|accept|resolve|harden)/.test(value)) {
    return 'Fixed'
  }

  return 'Improved'
}

function parseMergeCommit(value: GitHubCommit): ChangelogEntry | null {
  if (!Array.isArray(value.parents) || value.parents.length < 2) return null
  if (typeof value.sha !== 'string' || typeof value.html_url !== 'string') return null

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

  const title = lines.slice(1).join(' ').trim() || `Pull request #${pullRequest}`
  const rawDate = value.commit?.committer?.date || value.commit?.author?.date
  if (typeof rawDate !== 'string' || Number.isNaN(Date.parse(rawDate))) return null

  return {
    sha: value.sha,
    shortSha: value.sha.slice(0, 7),
    title,
    date: new Date(rawDate).toISOString(),
    url: value.html_url,
    pullRequest,
    category: categoryForTitle(title),
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

  if (!response.ok) {
    throw new Error(`GitHub commits request failed with ${response.status}`)
  }

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
    if (parsed) unique.set(parsed.sha, parsed)
  }

  return [...unique.values()].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
}

export async function getChangelog(): Promise<ChangelogResult> {
  try {
    const entries = await fetchAllMergeCommits()
    if (!entries.length) throw new Error('No merged commits were returned')
    return { entries, source: 'github' }
  } catch (error) {
    console.error('Unable to refresh the public changelog from GitHub.', error)
    return { entries: fallbackEntries, source: 'fallback' }
  }
}
