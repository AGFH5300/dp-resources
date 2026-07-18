import type { ChangelogEntry } from '@/lib/changelog';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateKey(date: string) {
  return new Date(date).toISOString().slice(0, 10);
}

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const groups: Array<{ date: string; entries: ChangelogEntry[] }> = [];

  for (const entry of entries) {
    const key = dateKey(entry.date);
    const current = groups[groups.length - 1];
    if (current?.date === key) current.entries.push(entry);
    else groups.push({ date: key, entries: [entry] });
  }

  return (
    <section aria-labelledby="updates-heading" className="mt-10">
      <h2 id="updates-heading" className="sr-only">
        DP Resources updates
      </h2>
      <div className="space-y-10 sm:space-y-12">
        {groups.map((group) => (
          <article
            key={group.date}
            className="grid gap-4 border-t border-[#e5dccd] pt-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8"
          >
            <h3 className="text-lg font-semibold tracking-tight text-[#10243f]">
              <time dateTime={group.date}>
                {dateFormatter.format(new Date(`${group.date}T00:00:00Z`))}
              </time>
            </h3>

            <ul className="space-y-3 text-[15px] leading-7 text-slate-600 sm:text-base">
              {group.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="relative pl-5 before:absolute before:left-0 before:top-[0.72rem] before:size-1.5 before:rounded-full before:bg-[#b5832d]"
                >
                  {entry.summary}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
