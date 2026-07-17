import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

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
})
