import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shouldBypassSupabaseMiddleware } from '../middleware'

const read = (path: string) => readFileSync(path, 'utf8')

describe('public changelog page', () => {
  it('renders a plain dated changelog rather than exposing a GitHub activity feed', () => {
    expect(existsSync('app/changelog/page.tsx')).toBe(true)
    expect(existsSync('app/changelog/changelog-list.tsx')).toBe(true)

    const page = read('app/changelog/page.tsx')
    const list = read('app/changelog/changelog-list.tsx')

    expect(page).toContain("path: '/changelog'")
    expect(page).toContain('getChangelog()')
    expect(page).toContain('A plain-language record')
    expect(list).toContain("month: 'long'")
    expect(list).toContain("day: 'numeric'")
    expect(list).toContain('group.entries.map')
    expect(list).toContain('entry.summary')
    expect(list).not.toContain("'use client'")
    expect(list).not.toContain('View commit')
    expect(list).not.toContain('pullRequest')
    expect(list).not.toContain('categoryStyles')
    expect(list).not.toContain('type="search"')
  })

  it('uses merged main-branch history and consolidates it into daily release notes', () => {
    const source = read('lib/changelog.ts')

    expect(source).toContain('/commits?sha=main')
    expect(source).toContain('Merge pull request #')
    expect(source).toContain('historicalSummaries')
    expect(source).toContain('consolidateHistory')
    expect(source).toContain('sentenceFromTitle')
    expect(source).toContain('next: { revalidate: REVALIDATE_SECONDS }')
    expect(source).not.toContain('GITHUB_TOKEN')
  })

  it('is linked from the footer, indexed publicly, and bypasses session middleware', () => {
    expect(read('components/site-footer.tsx')).toContain('href="/changelog"')
    expect(read('app/sitemap.ts')).toContain("absoluteUrl('/changelog')")
    expect(shouldBypassSupabaseMiddleware('/changelog')).toBe(true)
  })
})
