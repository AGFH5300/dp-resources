import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('SEO and branding assets', () => {
  it('uses clean public logo and favicon paths instead of generated icon routes', () => {
    expect(existsSync('public/brand/dp-logo.png')).toBe(true)
    expect(existsSync('public/brand/dp-wordmark.png')).toBe(true)
    expect(existsSync('public/brand/dp-favicon.png')).toBe(true)
    expect(existsSync('app/icon.tsx')).toBe(false)
    expect(existsSync('app/apple-icon.tsx')).toBe(false)
    expect(existsSync('app/brand/dp-favicon.png/route.ts')).toBe(false)
    expect(existsSync('app/ChatGPT Image Jul 8, 2026, 11_40_32 PM.png')).toBe(false)
    expect(existsSync('app/ChatGPT Image Jul 8, 2026, 11_39_05 PM.png')).toBe(false)

    const target = [
      read('components/brand-mark.tsx'),
      read('components/brand-wordmark.tsx'),
      read('app/layout.tsx'),
      read('app/opengraph-image.tsx'),
    ].join('\n')

    expect(target).toContain('/brand/dp-logo.png')
    expect(target).toContain('/brand/dp-wordmark.png')
    expect(target).toContain('/brand/dp-favicon.png')
    expect(target).not.toContain('ChatGPT Image Jul')
  })

  it('keeps only public pages in the sitemap and blocks private app routes in robots', () => {
    const sitemap = read('app/sitemap.ts')
    const robots = read('app/robots.ts')

    expect(sitemap).toContain("absoluteUrl('/')")
    expect(sitemap).toContain("absoluteUrl('/auth/login')")
    expect(sitemap).toContain("absoluteUrl('/auth/sign-up')")
    expect(sitemap).toContain("absoluteUrl('/privacy')")
    expect(sitemap).toContain("absoluteUrl('/terms')")
    expect(sitemap).not.toContain("absoluteUrl('/library')")
    expect(sitemap).not.toContain("absoluteUrl('/admin')")

    expect(robots).toContain("'/api/'")
    expect(robots).toContain("'/admin'")
    expect(robots).toContain("'/library'")
    expect(robots).toContain("'/resource/'")
  })

  it('renders legal pages as standalone public pages, not authenticated app chrome', () => {
    for (const page of [read('app/privacy/page.tsx'), read('app/terms/page.tsx')]) {
      expect(page).toContain('BrandWordmark')
      expect(page).not.toContain("@/components/nav")
      expect(page).not.toContain('<Nav')
      expect(page).not.toContain('AppHeader')
      expect(page).not.toContain('AuthShell')
    }
  })
})
