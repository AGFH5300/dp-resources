'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import type { ChangelogCategory, ChangelogEntry } from '@/lib/changelog'

const categories: Array<'All' | ChangelogCategory> = [
  'All',
  'New',
  'Improved',
  'Fixed',
  'Security',
  'Infrastructure',
]

const categoryStyles: Record<ChangelogCategory, string> = {
  New: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Improved: 'border-blue-200 bg-blue-50 text-blue-800',
  Fixed: 'border-amber-200 bg-amber-50 text-amber-900',
  Security: 'border-rose-200 bg-rose-50 text-rose-800',
  Infrastructure: 'border-slate-200 bg-slate-100 text-slate-700',
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function monthKey(date: string) {
  return monthFormatter.format(new Date(date))
}

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | ChangelogCategory>('All')

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return entries.filter((entry) => {
      if (category !== 'All' && entry.category !== category) return false
      if (!term) return true
      return [entry.title, entry.shortSha, `#${entry.pullRequest}`, entry.category]
        .some((value) => value.toLocaleLowerCase().includes(term))
    })
  }, [category, entries, query])

  const groups = useMemo(() => {
    const result: Array<{ month: string; entries: ChangelogEntry[] }> = []
    for (const entry of filtered) {
      const month = monthKey(entry.date)
      const current = result[result.length - 1]
      if (current?.month === month) current.entries.push(entry)
      else result.push({ month, entries: [entry] })
    }
    return result
  }, [filtered])

  return (
    <section aria-labelledby="updates-heading" className="mt-8">
      <div className="rounded-2xl border border-[#e5dccd] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="updates-heading" className="text-xl font-semibold text-[#10243f]">All updates</h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {filtered.length} of {entries.length} merged updates.
            </p>
          </div>

          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search changelog</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search updates, PRs, or commits"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-[#d9d2c5] bg-[#fbfaf7] pl-10 pr-3 text-sm text-[#10243f] outline-none placeholder:text-slate-400 focus:border-[#0759ff] focus:bg-white focus:ring-2 focus:ring-[#0759ff]/15"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter changelog by category">
          {categories.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={category === option}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                category === option
                  ? 'border-[#10243f] bg-[#10243f] text-white'
                  : 'border-[#d9d2c5] bg-white text-slate-600 hover:border-[#10243f]/40 hover:text-[#10243f]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {groups.length ? (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.month} aria-labelledby={`month-${group.month.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="flex items-center gap-4">
                <h3
                  id={`month-${group.month.replace(/\s+/g, '-').toLowerCase()}`}
                  className="shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-[#b5832d]"
                >
                  {group.month}
                </h3>
                <div className="h-px flex-1 bg-[#e5dccd]" />
              </div>

              <ol className="mt-4 space-y-3">
                {group.entries.map((entry) => (
                  <li key={entry.sha}>
                    <article className="group rounded-2xl border border-[#e5dccd] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#cfc4b3] hover:shadow-md sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryStyles[entry.category]}`}>
                              {entry.category}
                            </span>
                            <time dateTime={entry.date} className="text-xs font-medium text-slate-500">
                              {dateFormatter.format(new Date(entry.date))}
                            </time>
                          </div>
                          <h4 className="mt-3 text-base font-semibold leading-6 text-[#10243f] sm:text-lg">
                            {entry.title}
                          </h4>
                          <p className="mt-2 text-xs text-slate-500">
                            Merged in PR #{entry.pullRequest} · commit {entry.shortSha}
                          </p>
                        </div>

                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View commit ${entry.shortSha} on GitHub`}
                          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#d9d2c5] px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#10243f] hover:text-[#10243f]"
                        >
                          View commit
                          <ExternalLink aria-hidden="true" className="size-3.5" />
                        </a>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d9d2c5] bg-white px-5 py-12 text-center">
          <p className="font-semibold text-[#10243f]">No matching updates</p>
          <p className="mt-1 text-sm text-slate-500">Try another search or select a different category.</p>
        </div>
      )}
    </section>
  )
}
