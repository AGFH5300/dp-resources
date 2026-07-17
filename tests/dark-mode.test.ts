import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')
const pngSize = (path: string) => {
  const png = readFileSync(path)
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), colourType: png[25] }
}

describe('dark mode', () => {
  it('bootstraps the saved or system theme before hydration', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain("localStorage.getItem('dp-theme')")
    expect(layout).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(layout).toContain('dangerouslySetInnerHTML')
    expect(layout).toContain('suppressHydrationWarning')
    expect(layout).toContain("colorScheme: 'light dark'")
  })

  it('offers persistent light, dark, and system choices', () => {
    const toggle = read('components/theme-toggle.tsx')
    expect(toggle).toContain("type ThemePreference = 'light' | 'dark' | 'system'")
    expect(toggle).toContain("window.localStorage.setItem(STORAGE_KEY, next)")
    expect(toggle).toContain("media.addEventListener('change', handleSystemChange)")
    expect(toggle).toContain('role="menuitemradio"')
    expect(toggle).toContain('aria-checked={preference === value}')
  })

  it('exposes the chooser across authenticated, public, and auth surfaces', () => {
    for (const path of [
      'components/app-header.tsx',
      'components/auth-shell.tsx',
      'app/page.tsx',
      'app/privacy/page.tsx',
      'app/terms/page.tsx',
      'app/changelog/page.tsx',
      'app/account-suspended/page.tsx',
    ]) {
      expect(read(path), path).toContain('<ThemeToggle')
    }
  })

  it('themes existing utility surfaces while preserving rendered PDF pages', () => {
    const css = read('app/globals.css')
    const pdf = read('app/resource/[fileId]/pdf-viewer.tsx')
    expect(css).toContain("html[data-theme='dark']")
    expect(css).toContain("[class~='bg-white']")
    expect(css).toContain("[class~='text-[color:var(--dp-navy)]']")
    expect(css).toContain('[data-theme-preserve-light]')
    expect(pdf).toContain('data-theme-preserve-light')
  })

  it('uses exact-size transparent dark logo variants', () => {
    const lightWordmark = 'public/brand/dp-wordmark.png'
    const darkWordmark = 'public/brand/dp-wordmark-dark.png'
    const lightLogo = 'public/brand/dp-logo.png'
    const darkLogo = 'public/brand/dp-logo-dark.png'
    expect(existsSync(darkWordmark)).toBe(true)
    expect(existsSync(darkLogo)).toBe(true)
    expect(pngSize(darkWordmark)).toMatchObject({ ...pngSize(lightWordmark), colourType: 6 })
    expect(pngSize(darkLogo)).toMatchObject({ ...pngSize(lightLogo), colourType: 6 })
    expect(read('components/brand-wordmark.tsx')).toContain('/brand/dp-wordmark-dark.png')
    expect(read('components/brand-mark.tsx')).toContain('/brand/dp-logo-dark.png')
  })

  it('uses dedicated dark-safe loading, progress, search hover, and divider styles', () => {
    const css = read('app/globals.css')
    const search = read('components/global-search.tsx')
    const pdf = read('app/resource/[fileId]/pdf-viewer.tsx')
    const presentation = read('app/resource/[fileId]/presentation-viewer.tsx')
    expect(css).toContain('--dp-progress-track: #22324a')
    expect(css).toContain('--dp-search-hover: #19273a')
    expect(css).toContain("html[data-theme='dark'] .dp-loading-overlay")
    expect(css).toContain("[class~='border-stone-200/80']")
    expect(search).toContain('dp-search-result-active')
    expect(search).not.toContain('hover:bg-white/70')
    expect(pdf).toContain('PDF preparation progress')
    expect(presentation).toContain('Presentation download progress')
  })
})
