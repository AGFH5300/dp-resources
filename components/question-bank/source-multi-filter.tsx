'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SourceMultiFilter({
  options,
  selected,
  compact = false,
}: {
  options: Array<{ slug: string; label: string; count?: number }>;
  selected: string[];
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (options.length < 2) return null;
  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((item) => item !== slug)
      : [...selected, slug];
    const query = new URLSearchParams(params.toString());
    query.delete('page');
    if (next.length) query.set('sources', next.join(','));
    else query.delete('sources');
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  };
  return (
    <fieldset className={compact ? 'mt-3' : 'mt-4'}>
      <legend className="text-sm font-medium text-slate-700">Sources</legend>
      <div className="mt-1 flex flex-wrap gap-2" aria-label="Filter by source; matches any selected source">
        {options.map((option) => (
          <label
            key={option.slug}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.slug)}
              onChange={() => toggle(option.slug)}
              className="size-3.5"
            />
            <span>{option.label}</span>
            {option.count !== undefined ? (
              <small className="text-slate-500">{option.count.toLocaleString()}</small>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
