import Link from 'next/link';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getResourceIndexSnapshot } from '@/lib/indexed-resource';
import type { ResourceIndex } from '@/lib/types';

function resourceFolderNames(path: string | undefined, resourceName: string) {
  const parts = String(path || '')
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0] === 'Library') parts.shift();
  if (parts.at(-1) === resourceName) parts.pop();
  return parts;
}

function resourceFolderPaths(path: string | undefined, resourceName: string) {
  const names = resourceFolderNames(path, resourceName);
  const paths: string[] = [];
  let current = 'Library';
  for (const name of names) {
    current += ` / ${name}`;
    paths.push(current);
  }
  return { names, paths };
}

export function ResourceFolderBreadcrumbFallback({
  path,
  resourceName,
}: {
  path?: string;
  resourceName: string;
}) {
  return resourceFolderNames(path, resourceName).map((folderName, index) => (
    <span
      key={`${folderName}-${index}`}
      className="inline-flex items-center gap-1"
    >
      <span>/</span>
      <span className="font-medium">{folderName}</span>
    </span>
  ));
}

export async function ResourceFolderBreadcrumbLinks({
  path,
  resourceName,
}: {
  path?: string;
  resourceName: string;
}) {
  const { names, paths } = resourceFolderPaths(path, resourceName);
  if (!paths.length) return null;

  const snapshot = await getResourceIndexSnapshot();
  if (!snapshot.ready) {
    return (
      <ResourceFolderBreadcrumbFallback path={path} resourceName={resourceName} />
    );
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_resource_index')
    .select('drive_file_id,name,path,is_folder')
    .eq('is_folder', true)
    .in('path', paths);

  if (error || !data?.length) {
    return (
      <ResourceFolderBreadcrumbFallback path={path} resourceName={resourceName} />
    );
  }

  const byPath = new Map(
    (data as Pick<ResourceIndex, 'drive_file_id' | 'name' | 'path' | 'is_folder'>[]).map(
      (row) => [row.path, row] as const,
    ),
  );

  return names.map((folderName, index) => {
    const row = byPath.get(paths[index]);
    return (
      <span
        key={row?.drive_file_id || `${folderName}-${index}`}
        className="inline-flex items-center gap-1"
      >
        <span>/</span>
        {row ? (
          <Link
            href={`/library?folder=${encodeURIComponent(row.drive_file_id)}`}
            className="font-medium text-[color:var(--dp-blue)] hover:underline"
          >
            {folderName}
          </Link>
        ) : (
          <span className="font-medium">{folderName}</span>
        )}
      </span>
    );
  });
}
