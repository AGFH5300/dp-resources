import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const middleware = readFileSync('middleware.ts', 'utf8')
const resourcesPage = readFileSync('app/resources/page.tsx', 'utf8')
const mypPage = readFileSync('app/myp/page.tsx', 'utf8')
const seo = readFileSync('lib/seo.ts', 'utf8')
const og = readFileSync('app/opengraph-image.tsx', 'utf8')

describe('separate resources landing domains', () => {
  it('keeps the DP app canonical domain unchanged', () => {
    expect(seo).toContain('https://dp.resources.anshgupta.cc')
    expect(og).toContain('https://dp.resources.anshgupta.cc/brand/dp-wordmark.png')
    expect(seo).not.toContain('https://resources.anshgupta.cc').
  })

  it('rewrites the standalone landing domains to static pages', () => {
    expect(middleware).toContain("RESOURCES_HUB_HOST = 'resources.anshgupta.cc'")
    expect(middleware).toContain("MYP_RESOURCES_HOST = 'myp.resources.anshgupta.cc'")
    expect(middleware).toContain("url.pathname = '/resources'")
    expect(middleware).toContain("url.pathname = '/myp'")
    expect(middleware).toContain("'/resources'")
    expect(middleware).toContain("'/myp'")
  })

  it('adds static hub and MYP landing pages', () => {
    expect(existsSync('app/resources/page.tsx')).toBe(true)
    expect(existsSync('app/myp/page.tsx')).toBe(true)
    expect(resourcesPage).toContain('MYP Resources')
    expect(resourcesPage).toContain('DP Resources')
    expect(resourcesPage).toContain('https://myp.resources.anshgupta.cc')
    expect(resourcesPage).toContain('https://dp.resources.anshgupta.cc')
    expect(mypPage).toContain('NEXT_PUBLIC_MYP_DRIVE_URL')
    expect(mypPage).toContain('Open Google Drive')
  })
})
