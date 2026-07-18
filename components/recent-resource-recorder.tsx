'use client';

import { useEffect } from 'react';
import { rememberRecentResource } from '@/lib/recent-client-storage';
import type { RecentResource } from '@/lib/recent-resources';

export function RecentResourceRecorder({
  resource,
}: {
  resource: Omit<RecentResource, 'at'>;
}) {
  useEffect(() => {
    rememberRecentResource({ ...resource, at: Date.now() });
    void fetch('/api/recent/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: resource.id }),
      keepalive: true,
    }).catch(() => undefined);
  }, [resource.id, resource.isFolder, resource.mimeType, resource.name, resource.path]);

  return null;
}
