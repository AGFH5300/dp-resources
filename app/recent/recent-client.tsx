'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { readRecentResources } from '@/lib/recent-client-storage';
import {
  mergeRecentResources,
  type RecentResource,
} from '@/lib/recent-resources';

export function RecentClient({ initialRows }: { initialRows: RecentResource[] }) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    const refresh = () =>
      setRows(mergeRecentResources(initialRows, readRecentResources()));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('dp:recent-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('dp:recent-updated', refresh);
    };
  }, [initialRows]);
  return (
    <div className="mt-5 border-y border-slate-200 bg-white">
      {rows.length ? (
        rows.map((r) => (
          <Link
            key={r.id}
            href={r.isFolder ? `/library?folder=${r.id}` : `/resource/${r.id}`}
            className="grid gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-blue-50/60 md:grid-cols-[minmax(260px,1fr)_1fr_180px]"
          >
            <span className="flex min-w-0 items-center gap-3 font-medium">
              <ResourceTypeIcon
                item={{ isFolder: r.isFolder, mimeType: r.mimeType }}
              />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="truncate text-slate-500">{r.path}</span>
            <span className="text-slate-500">
              {new Date(r.at).toLocaleString()}
            </span>
          </Link>
        ))
      ) : (
        <div className="border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Recently opened resources will appear here after you open files or
          folders.
        </div>
      )}
    </div>
  );
}
