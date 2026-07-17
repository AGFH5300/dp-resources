'use client'

import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type ThemePreference = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'dp-theme'
const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  root.style.colorScheme = resolved
  window.dispatchEvent(new CustomEvent('dp:theme-change', { detail: { preference, resolved } }))
  return resolved
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [preference, setPreference] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initial = readPreference()
    setPreference(initial)
    setResolved(applyTheme(initial))

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = () => {
      if (readPreference() === 'system') {
        setResolved(applyTheme('system'))
      }
    }
    media.addEventListener('change', handleSystemChange)
    return () => media.removeEventListener('change', handleSystemChange)
  }, [])

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const choose = (next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The selected theme still applies for this page when storage is blocked.
    }
    setPreference(next)
    setResolved(applyTheme(next))
    setOpen(false)
  }

  const ActiveIcon = resolved === 'dark' ? Moon : Sun
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={`Theme: ${preference}. Change colour theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-[color:var(--dp-navy)]"
      >
        <ActiveIcon className="size-4.5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Colour theme"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {options.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              onClick={() => choose(value)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <Icon className="size-4 text-slate-500" aria-hidden="true" />
              <span>{label}</span>
              {preference === value ? <Check className="ml-auto size-4 text-[color:var(--dp-blue)]" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
