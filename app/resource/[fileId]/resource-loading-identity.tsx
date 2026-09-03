'use client';

import { useEffect, useState } from 'react';
import { typeLabel } from '@/lib/resource-utils';

type RecentResource = {
  id: string;
  name: string;
  mimeType?: string;
  isFolder?: boolean;
  path?: string;
};

function currentFileId() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const raw = parts.at(-1) || '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function ResourceLoadingIdentity() {
  const [resource, setResource] = useState<RecentResource | null>(null);

  useEffect(() => {
    try {
      const fileId = currentFileId();
      const parsed: unknown = JSON.parse(localStorage.getItem('dp_recent') || '[]');
      if (!Array.isArray(parsed)) return;
      const hit = parsed.find(
        (entry): entry is RecentResource =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          (entry as RecentResource).id === fileId &&
          typeof (entry as RecentResource).name === 'string',
      );
      if (hit) setResource(hit);
    } catch {
      // The generic loading shell remains useful when local history is unavailable.
    }
  }, []);

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Opening resource
      </p>
      <h1 className="mt-1 truncate text-lg font-semibold text-[color:var(--dp-navy)]">
        {resource?.name || 'Loading resource…'}
      </h1>
      {resource?.mimeType ? (
        <span className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {typeLabel(resource.mimeType, false)}
        </span>
      ) : null}
    </div>
  );
}
